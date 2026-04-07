import { Schema, type Model, type Connection, type Document } from 'mongoose';

/**
 * Fix for B-3.1, B-3.13: Atomic counter for sequential number generation.
 * Uses findOneAndUpdate with $inc to prevent race conditions on
 * lead/order number generation under concurrent load.
 */
export interface ICounterDocument extends Document {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<ICounterDocument>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

/**
 * Atomically increment and return the next sequence number.
 */
export async function getNextSequence(
  CounterModel: Model<ICounterDocument>,
  sequenceName: string,
): Promise<number> {
  const counter = await CounterModel.findOneAndUpdate(
    { _id: sequenceName },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  return counter.seq;
}

export function createCounterModel(connection: Connection): Model<ICounterDocument> {
  return connection.model<ICounterDocument>('Counter', counterSchema);
}
