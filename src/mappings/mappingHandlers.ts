import {
  Block,
  Club,
  Message,
  Stake,
  Transaction,
} from '../types';
import {
  CosmosBlock,
  CosmosEvent,
  CosmosMessage,
  CosmosTransaction,
} from '@subql/types-cosmos';

export async function handleBlock(block: CosmosBlock): Promise<void> {
  const id = block.block.header.height.toString();
  const blockRecord = new Block(id);
  blockRecord.height = BigInt(id);
  blockRecord.id = id;
  await blockRecord.save();
  // If you wanted to index each block in Cosmos (Juno), you could do that here
}

export async function handleTransaction(tx: CosmosTransaction): Promise<void> {
  const transactionRecord = new Transaction(tx.hash);
  transactionRecord.blockHeight = BigInt(tx.block.block.header.height);
  transactionRecord.timestamp = tx.block.block.header.time;
  await transactionRecord.save();
}

export async function handleMessage(msg: CosmosMessage): Promise<void> {
  logger.debug(msg)
  if (!Array.isArray(JSON.parse(msg.tx.tx.log))) return;
  const executeMsg = msg.msg.decodedMsg.msg;
  const sender = msg.msg.decodedMsg.sender;
  const contract = msg.msg.decodedMsg.contract;

  const executeType = Object.keys(executeMsg)?.[0];
  const messageRecord = new Message(`${msg.tx.hash}-${msg.idx}`);

  switch (executeType) {
    case 'assign_a_club':
      {
        const clubName = executeMsg?.assign_a_club?.club_name.split(' - ')?.[0];
        const sport =
          executeMsg?.assign_a_club?.club_name.split(' - ')?.[1] || 'Football';
        const clubId = `${clubName} - ${sport}`;
        const owner = executeMsg?.assign_a_club?.buyer;
        let club = await Club.get(clubId);
        if (!club) {
          club = new Club(clubId);
          club.owner = owner;
          club.sport = sport;
          club.club_name = clubId;
        }
        await club.save();
      }
      break;
    case 'assign_stakes_to_a_club':
      {
        const clubName =
          executeMsg?.assign_stakes_to_a_club?.club_name.split(' - ')?.[0];
        const sport =
          executeMsg?.assign_stakes_to_a_club?.club_name.split(' - ')?.[1] ||
          'Football';
        const clubId = `${clubName} - ${sport}`;
        const stakeList = executeMsg?.assign_stakes_to_a_club?.stake_list;
        stakeList.forEach(async (s) => {
          const stakeId = `${s.staker_address}-${clubId}`;
          await addStake(stakeId, {
            clubId,
            stakerAddress: s.staker_address,
            amount: s.staked_amount,
          });
        });
      }
      break;
    case 'stake_withdraw_from_a_club':
      {
        if (
          executeMsg.stake_withdraw_from_a_club.immediate_withdrawal === false
        ) {
          const stakeId = `${executeMsg.stake_withdraw_from_a_club.staker}-${executeMsg.stake_withdraw_from_a_club.club_name} - Football`;
          const stake = await Stake.get(stakeId);
          if (stake) {
            stake.amount -= BigInt(
              executeMsg.stake_withdraw_from_a_club.amount
            );
            await stake.save();
          }
        }
      }
      break;
    case 'stake_on_a_club':
      {
        const clubId = `${executeMsg.stake_on_a_club.club_name} - Football`;
        const stakeId = `${executeMsg.stake_on_a_club.staker}-${clubId}`;
        await addStake(stakeId, {
          clubId,
          stakerAddress: executeMsg.stake_on_a_club.staker,
          amount: executeMsg.stake_on_a_club.amount,
        });
      }
      break;
    default:
      return;
  }
  messageRecord.blockHeight = BigInt(msg.block.block.header.height);
  messageRecord.txHash = msg.tx.hash;
  messageRecord.sender = sender;
  messageRecord.contract = contract;
  await messageRecord.save();
}

export async function handleInit(msg: CosmosMessage): Promise<void> {
  logger.info(JSON.stringify(msg.msg));
}

const addStake = async (stakeId, { clubId, stakerAddress, amount }) => {
  let stake = await Stake.get(stakeId);
  if (!stake) {
    stake = new Stake(stakeId);
    stake.clubId = clubId;
    stake.staker = stakerAddress;
    stake.amount = BigInt(0);
  }
  stake.amount += BigInt(amount);
  await stake.save();
};
