import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import {
  JSBI,
  Token,
  Trade,
  Currency as CurrencyV2,
  TradeType,
  Fraction,
} from '@uniswap/sdk';
import { Currency, CurrencyAmount } from '@uniswap/sdk-core';
import ReactGA from 'react-ga';
import { ArrowDown } from 'react-feather';
import { Box, Button, CircularProgress } from '@material-ui/core';
import { useWalletModalToggle } from 'state/application/hooks';
import {
  useDerivedSwapInfo,
  useSwapActionHandlers,
  useSwapState,
} from 'state/swap/hooks';
import {
  useExpertModeManager,
  useUserSlippageTolerance,
} from 'state/user/hooks';
import { Field } from 'state/swap/actions';
import { useAllTokens } from 'hooks/Tokens';
import { CurrencyInput, ConfirmSwapModal, AddressInput } from 'components';
import { useActiveWeb3React } from 'hooks';
import {
  ApprovalState,
  useApproveCallbackFromBestTrade,
  useApproveCallbackFromTrade,
} from 'hooks/useApproveCallback';
import { useTransactionFinalizer } from 'state/transactions/hooks';
import useENSAddress from 'hooks/useENSAddress';
import useWrapCallback, { WrapType } from 'hooks/useWrapCallback';
import useToggledVersion, { Version } from 'hooks/useToggledVersion';
import {
  addMaticToMetamask,
  isSupportedNetwork,
  confirmPriceImpactWithoutFee,
  maxAmountSpend,
  basisPointsToPercent,
} from 'utils';
import { computeTradePriceBreakdown, warningSeverity } from 'utils/prices';
import { ReactComponent as PriceExchangeIcon } from 'assets/images/PriceExchangeIcon.svg';
import { ReactComponent as ExchangeIcon } from 'assets/images/ExchangeIcon.svg';
import 'components/styles/Swap.scss';
import { useTranslation } from 'react-i18next';
import { useParaswapCallback } from 'hooks/useParaswapCallback';
import { getBestTradeCurrencyAddress, useParaswap } from 'hooks/useParaswap';
import { SwapSide } from '@paraswap/sdk';
import { BestTradeAdvancedSwapDetails } from './BestTradeAdvancedSwapDetails';
import { GlobalValue } from 'constants/index';
import { useQuery } from 'react-query';
import { ONE } from 'lib/src/internalConstants';

const SwapBestTrade: React.FC<{
  currency0?: CurrencyV2;
  currency1?: CurrencyV2;
  currencyBgClass?: string;
}> = ({ currency0, currency1, currencyBgClass }) => {
  const { t } = useTranslation();
  const { account } = useActiveWeb3React();
  const { independentField, typedValue, recipient } = useSwapState();
  const {
    v1Trade,
    v2Trade,
    currencyBalances,
    parsedAmount,
    currencies,
    inputError: swapInputError,
  } = useDerivedSwapInfo();
  const toggledVersion = useToggledVersion();
  const finalizedTransaction = useTransactionFinalizer();
  const [isExpertMode] = useExpertModeManager();
  const {
    wrapType,
    execute: onWrap,
    inputError: wrapInputError,
  } = useWrapCallback(
    currencies[Field.INPUT],
    currencies[Field.OUTPUT],
    typedValue,
  );
  const allTokens = useAllTokens();
  const [swapType, setSwapType] = useState<SwapSide>(SwapSide.SELL);

  const showWrap: boolean = wrapType !== WrapType.NOT_APPLICABLE;
  const tradesByVersion = {
    [Version.v1]: v1Trade,
    [Version.v2]: v2Trade,
  };
  const trade = showWrap ? undefined : tradesByVersion[toggledVersion];

  const {
    onSwitchTokens,
    onCurrencySelection,
    onUserInput,
    onChangeRecipient,
  } = useSwapActionHandlers();
  const { address: recipientAddress } = useENSAddress(recipient);
  const [allowedSlippage] = useUserSlippageTolerance();
  const [approving, setApproving] = useState(false);
  const [approval, approveCallback] = useApproveCallbackFromBestTrade(
    trade,
    allowedSlippage,
  );
  const dependentField: Field =
    independentField === Field.INPUT ? Field.OUTPUT : Field.INPUT;
  const inputCurrency = currencies[Field.INPUT];
  const outputCurrency = currencies[Field.OUTPUT];

  const route = trade?.route;
  const noRoute = !route;

  const { priceImpactWithoutFee } = computeTradePriceBreakdown(trade);
  const [approvalSubmitted, setApprovalSubmitted] = useState<boolean>(false);
  const { ethereum } = window as any;
  const [mainPrice, setMainPrice] = useState(true);
  const priceImpactSeverity = warningSeverity(priceImpactWithoutFee);
  const isValid = !swapInputError;

  const showApproveFlow =
    !swapInputError &&
    (approval === ApprovalState.NOT_APPROVED ||
      approval === ApprovalState.PENDING ||
      (approvalSubmitted && approval === ApprovalState.APPROVED)) &&
    !(priceImpactSeverity > 3 && !isExpertMode);

  const toggleWalletModal = useWalletModalToggle();

  useEffect(() => {
    if (approval === ApprovalState.PENDING) {
      setApprovalSubmitted(true);
    }
  }, [approval, approvalSubmitted]);

  //TODO: move to utils
  const connectWallet = () => {
    if (ethereum && !isSupportedNetwork(ethereum)) {
      addMaticToMetamask();
    } else {
      toggleWalletModal();
    }
  };

  const handleCurrencySelect = useCallback(
    (inputCurrency) => {
      setApprovalSubmitted(false); // reset 2 step UI for approvals
      onCurrencySelection(Field.INPUT, inputCurrency);
    },
    [onCurrencySelection],
  );

  const handleOtherCurrencySelect = useCallback(
    (outputCurrency) => onCurrencySelection(Field.OUTPUT, outputCurrency),
    [onCurrencySelection],
  );

  const paraswap = useParaswap();

  const srcToken = inputCurrency
    ? getBestTradeCurrencyAddress(inputCurrency)
    : undefined;
  const destToken = outputCurrency
    ? getBestTradeCurrencyAddress(outputCurrency)
    : undefined;

  const srcDecimals = inputCurrency?.decimals;
  const destDecimals = outputCurrency?.decimals;
  const tradeDecimals = swapType === SwapSide.SELL ? srcDecimals : destDecimals;
  const pct = basisPointsToPercent(allowedSlippage);
  const slippageMultiplier =
    trade?.tradeType === TradeType.EXACT_INPUT
      ? new Fraction(ONE)
      : new Fraction(ONE).add(pct);

  const srcAmount =
    parsedAmount && tradeDecimals
      ? parsedAmount.multiply(JSBI.BigInt(10 ** tradeDecimals)).toFixed(0)
      : undefined;

  const maxImpactAllowed = isExpertMode
    ? 100
    : Number(
        GlobalValue.percents.BLOCKED_PRICE_IMPACT_NON_EXPERT.multiply(
          '100',
        ).toFixed(4),
      );

  const fetchOptimalRate = async () => {
    if (!srcToken || !destToken || !srcAmount) {
      return;
    }
    try {
      const rate = await paraswap.getRate({
        srcToken,
        destToken,
        srcDecimals,
        destDecimals,
        amount: srcAmount,
        side: swapType,
        options: {
          includeDEXS: 'quickswap,quickswapv3',
          maxImpact: maxImpactAllowed,
          partner: 'quickswapv3',
        },
      });
      return rate;
    } catch (err) {
      return;
    }
  };

  const { data: optimalRate } = useQuery('fetchOptimalRate', fetchOptimalRate, {
    refetchInterval: 1000,
  });

  const parsedAmounts = useMemo(() => {
    const parsedAmountInput =
      inputCurrency && parsedAmount
        ? CurrencyAmount.fromRawAmount(
            inputCurrency as Currency,
            parsedAmount.raw,
          )
        : undefined;
    const parsedAmountOutput =
      outputCurrency && parsedAmount
        ? CurrencyAmount.fromRawAmount(
            outputCurrency as Currency,
            parsedAmount.raw,
          )
        : undefined;

    return showWrap
      ? {
          [Field.INPUT]: parsedAmountInput,
          [Field.OUTPUT]: parsedAmountOutput,
        }
      : {
          [Field.INPUT]:
            independentField === Field.INPUT
              ? parsedAmountInput
              : optimalRate && outputCurrency
              ? CurrencyAmount.fromRawAmount(
                  inputCurrency as Currency,
                  JSBI.BigInt(optimalRate.srcAmount),
                )
              : undefined,
          [Field.OUTPUT]:
            independentField === Field.OUTPUT
              ? parsedAmountOutput
              : optimalRate && outputCurrency
              ? CurrencyAmount.fromRawAmount(
                  outputCurrency as Currency,
                  JSBI.BigInt(optimalRate.destAmount),
                )
              : undefined,
        };
  }, [
    parsedAmount,
    independentField,
    showWrap,
    optimalRate,
    inputCurrency,
    outputCurrency,
  ]);
  const formattedAmounts = useMemo(() => {
    return {
      [independentField]: typedValue,
      [dependentField]: showWrap
        ? parsedAmounts[independentField]?.toExact() ?? ''
        : parsedAmounts[dependentField]?.toExact() ?? '',
    };
  }, [independentField, typedValue, dependentField, showWrap, parsedAmounts]);

  const userHasSpecifiedInputOutput = Boolean(
    currencies[Field.INPUT] &&
      currencies[Field.OUTPUT] &&
      parsedAmounts[independentField]?.greaterThan(JSBI.BigInt(0)),
  );

  const {
    callback: paraswapCallback,
    error: paraswapCallbackError,
  } = useParaswapCallback(optimalRate, trade, allowedSlippage, recipient);

  const swapButtonText = useMemo(() => {
    if (account) {
      if (!currencies[Field.INPUT] || !currencies[Field.OUTPUT]) {
        return t('selectToken');
      } else if (
        formattedAmounts[Field.INPUT] === '' &&
        formattedAmounts[Field.OUTPUT] === ''
      ) {
        return t('enterAmount');
      } else if (showWrap) {
        return wrapType === WrapType.WRAP
          ? t('wrap')
          : wrapType === WrapType.UNWRAP
          ? t('unWrap')
          : '';
      } else if (noRoute && userHasSpecifiedInputOutput) {
        return t('insufficientLiquidityTrade');
      } else {
        return swapInputError ?? t('swap');
      }
    } else {
      return ethereum && !isSupportedNetwork(ethereum)
        ? t('switchPolygon')
        : t('connectWallet');
    }
  }, [
    t,
    formattedAmounts,
    currencies,
    account,
    ethereum,
    noRoute,
    userHasSpecifiedInputOutput,
    showWrap,
    wrapType,
    swapInputError,
  ]);

  const swapButtonDisabled = useMemo(() => {
    if (account) {
      if (showWrap) {
        return Boolean(wrapInputError);
      } else if (noRoute && userHasSpecifiedInputOutput) {
        return true;
      } else if (showApproveFlow) {
        return (
          !isValid ||
          approval !== ApprovalState.APPROVED ||
          (optimalRate &&
            !optimalRate.maxImpactReached &&
            priceImpactSeverity > 3 &&
            !isExpertMode)
        );
      } else {
        return (
          !isValid ||
          (optimalRate &&
            !optimalRate.maxImpactReached &&
            priceImpactSeverity > 3 &&
            !isExpertMode) ||
          !!paraswapCallbackError
        );
      }
    } else {
      return false;
    }
  }, [
    account,
    showWrap,
    wrapInputError,
    noRoute,
    userHasSpecifiedInputOutput,
    showApproveFlow,
    approval,
    priceImpactSeverity,
    isValid,
    paraswapCallbackError,
    isExpertMode,
    optimalRate,
  ]);

  const [
    {
      showConfirm,
      txPending,
      tradeToConfirm,
      swapErrorMessage,
      attemptingTxn,
      txHash,
    },
    setSwapState,
  ] = useState<{
    showConfirm: boolean;
    txPending?: boolean;
    tradeToConfirm: Trade | undefined;
    attemptingTxn: boolean;
    swapErrorMessage: string | undefined;
    txHash: string | undefined;
  }>({
    showConfirm: false,
    txPending: false,
    tradeToConfirm: undefined,
    attemptingTxn: false,
    swapErrorMessage: undefined,
    txHash: undefined,
  });

  const handleTypeInput = useCallback(
    (value: string) => {
      onUserInput(Field.INPUT, value);
      setSwapType(SwapSide.SELL);
    },
    [onUserInput],
  );
  const handleTypeOutput = useCallback(
    (value: string) => {
      onUserInput(Field.OUTPUT, value);
      setSwapType(SwapSide.BUY);
    },
    [onUserInput],
  );

  const maxAmountInputV2 = maxAmountSpend(currencyBalances[Field.INPUT]);
  const maxAmountInput =
    maxAmountInputV2 && inputCurrency
      ? CurrencyAmount.fromRawAmount(
          inputCurrency as Currency,
          maxAmountInputV2.raw,
        )
      : undefined;

  const handleMaxInput = useCallback(() => {
    maxAmountInput && onUserInput(Field.INPUT, maxAmountInput.toExact());
  }, [maxAmountInput, onUserInput]);

  const handleHalfInput = useCallback(() => {
    if (!maxAmountInput) {
      return;
    }

    const halvedAmount = maxAmountInput.divide('2');

    onUserInput(
      Field.INPUT,
      halvedAmount.toFixed(maxAmountInput.currency.decimals),
    );
  }, [maxAmountInput, onUserInput]);

  const atMaxAmountInput = Boolean(
    maxAmountInput && parsedAmounts[Field.INPUT]?.equalTo(maxAmountInput),
  );

  const onParaswap = () => {
    if (showWrap && onWrap) {
      onWrap();
    } else if (isExpertMode) {
      handleParaswap();
    } else {
      setSwapState({
        tradeToConfirm: trade,
        attemptingTxn: false,
        swapErrorMessage: undefined,
        showConfirm: true,
        txHash: undefined,
      });
    }
  };

  useEffect(() => {
    onCurrencySelection(Field.INPUT, Token.ETHER);
  }, [onCurrencySelection, allTokens]);

  useEffect(() => {
    if (currency0) {
      onCurrencySelection(Field.INPUT, currency0);
    }
    if (currency1) {
      onCurrencySelection(Field.OUTPUT, currency1);
    }
  }, [onCurrencySelection, currency0, currency1]);

  const handleAcceptChanges = useCallback(() => {
    setSwapState({
      tradeToConfirm: trade,
      swapErrorMessage,
      txHash,
      attemptingTxn,
      showConfirm,
    });
  }, [attemptingTxn, showConfirm, swapErrorMessage, trade, txHash]);

  const handleConfirmDismiss = useCallback(() => {
    setSwapState({
      showConfirm: false,
      tradeToConfirm,
      attemptingTxn,
      swapErrorMessage,
      txHash,
    });
    // if there was a tx hash, we want to clear the input
    if (txHash) {
      onUserInput(Field.INPUT, '');
    }
  }, [attemptingTxn, onUserInput, swapErrorMessage, tradeToConfirm, txHash]);

  const handleParaswap = useCallback(() => {
    if (
      priceImpactWithoutFee &&
      !confirmPriceImpactWithoutFee(priceImpactWithoutFee)
    ) {
      return;
    }
    if (!paraswapCallback) {
      return;
    }

    setSwapState({
      attemptingTxn: true,
      tradeToConfirm,
      showConfirm,
      swapErrorMessage: undefined,
      txHash: undefined,
    });
    paraswapCallback()
      .then(async ({ response, summary }) => {
        setSwapState({
          attemptingTxn: false,
          txPending: true,
          tradeToConfirm,
          showConfirm,
          swapErrorMessage: undefined,
          txHash: response.hash,
        });

        try {
          const receipt = await response.wait();
          finalizedTransaction(receipt, {
            summary,
          });
          setSwapState({
            attemptingTxn: false,
            txPending: false,
            tradeToConfirm,
            showConfirm,
            swapErrorMessage: undefined,
            txHash: response.hash,
          });
          ReactGA.event({
            category: 'Swap',
            action:
              recipient === null
                ? 'Swap w/o Send'
                : (recipientAddress ?? recipient) === account
                ? 'Swap w/o Send + recipient'
                : 'Swap w/ Send',
            label: [
              trade?.inputAmount?.currency?.symbol,
              trade?.outputAmount?.currency?.symbol,
            ].join('/'),
          });
        } catch (error) {
          setSwapState({
            attemptingTxn: false,
            tradeToConfirm,
            showConfirm,
            swapErrorMessage: (error as any).message,
            txHash: undefined,
          });
        }
      })
      .catch((error) => {
        setSwapState({
          attemptingTxn: false,
          tradeToConfirm,
          showConfirm,
          swapErrorMessage: error.message,
          txHash: undefined,
        });
      });
  }, [
    tradeToConfirm,
    account,
    priceImpactWithoutFee,
    recipient,
    recipientAddress,
    showConfirm,
    paraswapCallback,
    finalizedTransaction,
    trade,
  ]);

  const paraRate = optimalRate
    ? (Number(optimalRate.destAmount) * 10 ** optimalRate.srcDecimals) /
      (Number(optimalRate.srcAmount) * 10 ** optimalRate.destDecimals)
    : undefined;

  return (
    <Box>
      {showConfirm && (
        <ConfirmSwapModal
          isOpen={showConfirm}
          trade={trade}
          originalTrade={tradeToConfirm}
          onAcceptChanges={handleAcceptChanges}
          attemptingTxn={attemptingTxn}
          txPending={txPending}
          txHash={txHash}
          recipient={recipient}
          allowedSlippage={allowedSlippage}
          onConfirm={handleParaswap}
          swapErrorMessage={swapErrorMessage}
          onDismiss={handleConfirmDismiss}
        />
      )}
      <CurrencyInput
        title={`${t('from')}:`}
        id='swap-currency-input'
        currency={currencies[Field.INPUT]}
        onHalf={handleHalfInput}
        onMax={handleMaxInput}
        showHalfButton={true}
        showMaxButton={!atMaxAmountInput}
        otherCurrency={currencies[Field.OUTPUT]}
        handleCurrencySelect={handleCurrencySelect}
        amount={formattedAmounts[Field.INPUT]}
        setAmount={handleTypeInput}
        bgClass={currencyBgClass}
      />
      <Box className='exchangeSwap'>
        <ExchangeIcon onClick={onSwitchTokens} />
      </Box>
      <CurrencyInput
        title={`${t('toEstimate')}:`}
        id='swap-currency-output'
        currency={currencies[Field.OUTPUT]}
        showPrice={Boolean(trade && trade.executionPrice)}
        showMaxButton={false}
        otherCurrency={currencies[Field.INPUT]}
        handleCurrencySelect={handleOtherCurrencySelect}
        amount={formattedAmounts[Field.OUTPUT]}
        setAmount={handleTypeOutput}
        bgClass={currencyBgClass}
      />
      {paraRate && (
        <Box className='swapPrice'>
          <small>{t('price')}:</small>
          <small>
            1{' '}
            {
              (mainPrice ? currencies[Field.INPUT] : currencies[Field.OUTPUT])
                ?.symbol
            }{' '}
            = {(mainPrice ? paraRate : 1 / paraRate).toLocaleString()}{' '}
            {
              (mainPrice ? currencies[Field.OUTPUT] : currencies[Field.INPUT])
                ?.symbol
            }{' '}
            <PriceExchangeIcon
              onClick={() => {
                setMainPrice(!mainPrice);
              }}
            />
          </small>
        </Box>
      )}
      {!showWrap && isExpertMode && (
        <Box className='recipientInput'>
          <Box className='recipientInputHeader'>
            {recipient !== null ? (
              <ArrowDown size='16' color='white' />
            ) : (
              <Box />
            )}
            <Button
              onClick={() => onChangeRecipient(recipient !== null ? null : '')}
            >
              {recipient !== null
                ? `- ${t('removeSend')}`
                : `+ ${t('addSendOptional')}`}
            </Button>
          </Box>
          {recipient !== null && (
            <AddressInput
              label={t('recipient')}
              placeholder={t('walletOrENS')}
              value={recipient}
              onChange={onChangeRecipient}
            />
          )}
        </Box>
      )}
      <BestTradeAdvancedSwapDetails optimalRate={optimalRate} trade={trade} />
      <Box className='swapButtonWrapper'>
        {showApproveFlow && (
          <Box width='48%'>
            <Button
              fullWidth
              disabled={
                approving ||
                approval !== ApprovalState.NOT_APPROVED ||
                approvalSubmitted
              }
              onClick={async () => {
                setApproving(true);
                try {
                  await approveCallback();
                  setApproving(false);
                } catch (err) {
                  setApproving(false);
                }
              }}
            >
              {approval === ApprovalState.PENDING ? (
                <Box className='content'>
                  {t('approving')} <CircularProgress size={16} />
                </Box>
              ) : approvalSubmitted && approval === ApprovalState.APPROVED ? (
                t('approved')
              ) : (
                `${t('approve')} ${currencies[Field.INPUT]?.symbol}`
              )}
            </Button>
          </Box>
        )}
        <Box width={showApproveFlow ? '48%' : '100%'}>
          <Button
            fullWidth
            disabled={swapButtonDisabled as boolean}
            onClick={account ? onParaswap : connectWallet}
          >
            {swapButtonText}
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default SwapBestTrade;
