import React, { useState, useEffect, useMemo } from 'react';
import { Box, useMediaQuery, useTheme } from '@material-ui/core';
import { CurrencyLogo } from 'components';
import {
  StyledButton,
  StyledDarkBox,
  StyledFilledBox,
} from 'components/v3/Common/styledElements';
import { useFarmingHandlers } from 'hooks/useStakerHandlers';
import { FarmingType } from 'models/enums';
import Loader from 'components/Loader';
import { formatReward } from 'utils/formatReward';
import { Token } from '@uniswap/sdk';
import { useV3StakeData } from 'state/farms/hooks';
import { useActiveWeb3React } from 'hooks';

interface FarmCardDetailProps {
  el: any;
}

export default function FarmCardDetail({ el }: FarmCardDetailProps) {
  const rewardToken = el.eternalRewardToken;
  const earned = el.eternalEarned;
  const bonusEarned = el.eternalBonusEarned;
  const bonusRewardToken = el.eternalBonusRewardToken;

  const { chainId } = useActiveWeb3React();

  const { v3Stake } = useV3StakeData();
  const { txType, selectedTokenId, txConfirmed, txError, selectedFarmingType } =
    v3Stake ?? {};

  const { eternalCollectRewardHandler, withdrawHandler, claimRewardsHandler } =
    useFarmingHandlers() || {};

  const { breakpoints } = useTheme();
  const isMobile = useMediaQuery(breakpoints.down('xs'));

  return (
    <Box className='flex justify-evenly items-center flex-wrap'>
      <StyledDarkBox padding={1.5} width={1}>
        <Box>
          <p>Eternal Farming</p>
        </Box>
        {!el.eternalFarming && (
          <>
            <Box className='flex justify-center items-center' height='130px'>
              <small className='text-secondary'>No Eternal farms for now</small>
            </Box>
            <StyledButton
              height='40px'
              width='100%'
              disabled={
                selectedTokenId === el.id &&
                txType === 'withdraw' &&
                !txConfirmed &&
                !txError
              }
              onClick={() => {
                withdrawHandler(el.id);
              }}
            >
              {selectedTokenId === el.id &&
              txType === 'withdraw' &&
              !txConfirmed &&
              !txError ? (
                <>
                  <Loader size={'1rem'} stroke={'var(--white)'} />
                  <Box ml='5px'>
                    <small>Withdrawing</small>
                  </Box>
                </>
              ) : (
                <>
                  <small>Withdraw</small>
                </>
              )}
            </StyledButton>
          </>
        )}
        {el.eternalFarming && (
          <>
            <StyledFilledBox className='flex flex-wrap' mt={2} p={2}>
              <Box width={!isMobile && bonusRewardToken ? 0.5 : 1}>
                <small className='text-secondary'>Earned rewards</small>
                <Box mt={1}>
                  <Box className='flex items-center'>
                    {chainId && (
                      <CurrencyLogo
                        size={'24px'}
                        currency={
                          new Token(
                            chainId,
                            rewardToken.id,
                            Number(rewardToken.decimals),
                            rewardToken.symbol,
                          )
                        }
                      />
                    )}

                    <Box ml='6px'>
                      <p>{`${formatReward(earned)} ${rewardToken.symbol}`}</p>
                    </Box>
                  </Box>
                </Box>
              </Box>
              {bonusRewardToken && (
                <Box
                  mt={isMobile ? 2 : 0}
                  width={!isMobile ? 0.5 : 1}
                  textAlign={isMobile ? 'left' : 'right'}
                >
                  <small className='text-secondary'>Earned bonus</small>
                  <Box
                    mt={1}
                    className={`flex items-center ${
                      isMobile ? '' : 'justify-end'
                    }`}
                  >
                    {chainId && (
                      <CurrencyLogo
                        size={'24px'}
                        currency={
                          new Token(
                            chainId,
                            bonusRewardToken.id,
                            Number(bonusRewardToken.decimals),
                            bonusRewardToken.symbol,
                          )
                        }
                      />
                    )}
                    <Box ml='6px'>
                      <p>{`${formatReward(bonusEarned)} ${
                        bonusRewardToken.symbol
                      }`}</p>
                    </Box>
                  </Box>
                </Box>
              )}
            </StyledFilledBox>

            <Box
              marginTop={2}
              className='flex justify-between items-center flex-wrap'
            >
              <StyledButton
                height='40px'
                width={isMobile ? '100%' : '49%'}
                disabled={
                  (selectedTokenId === el.id &&
                    txType === 'eternalCollectReward' &&
                    !txConfirmed &&
                    !txError) ||
                  (el.eternalEarned == 0 && el.eternalBonusEarned == 0)
                }
                onClick={() => {
                  eternalCollectRewardHandler(el.id, { ...el });
                }}
              >
                {selectedTokenId === el.id &&
                txType === 'eternalCollectReward' &&
                !txConfirmed &&
                !txError ? (
                  <>
                    <Loader size={'18px'} stroke={'var(--white)'} />
                    <Box ml='5px'>
                      <small>{'Claiming'}</small>
                    </Box>
                  </>
                ) : (
                  <small>Claim</small>
                )}
              </StyledButton>
              <StyledButton
                height='40px'
                width={isMobile ? '100%' : '49%'}
                style={{ marginTop: isMobile ? '16px' : 0 }}
                disabled={
                  selectedTokenId === el.id &&
                  selectedFarmingType === FarmingType.ETERNAL &&
                  txType === 'claimRewards' &&
                  !txConfirmed &&
                  !txError
                }
                onClick={() => {
                  claimRewardsHandler(el.id, { ...el }, FarmingType.ETERNAL);
                }}
              >
                {selectedTokenId === el.id &&
                selectedFarmingType === FarmingType.ETERNAL &&
                txType === 'claimRewards' &&
                !txConfirmed &&
                !txError ? (
                  <>
                    <Loader size={'18px'} stroke={'var(--white)'} />
                    <Box ml='5px'>
                      <small>{' Undepositing'}</small>
                    </Box>
                  </>
                ) : (
                  <small>Undeposit</small>
                )}
              </StyledButton>
            </Box>
          </>
        )}
      </StyledDarkBox>
    </Box>
  );
}
