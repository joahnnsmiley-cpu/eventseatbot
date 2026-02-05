export type SeatStatus = 'available' | 'reserved' | 'sold';

export interface Seat {
  id: string;
  eventId: string;
  row: string;
  number: number;
  price: number;
  status: SeatStatus;
}
