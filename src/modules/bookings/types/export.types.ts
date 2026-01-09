import type { Response } from 'express';

export type StreamableResponse = Response;

export interface ClientExportRow {
  client_id: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  client_notes: string | null;
  client_createdAt: Date;
  bookingCount: string | number;
}

export interface BookingExportRow {
  id: string;
  clientName: string;
  clientEmail: string;
  package: string;
  eventDate: string;
  totalPrice: number;
  status: string;
  createdAt: string;
}

export interface ClientCsvRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  bookingCount: number;
  createdAt: Date;
}
