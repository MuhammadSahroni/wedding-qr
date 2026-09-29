export interface Guest {
  id: string;
  no: number;
  name: string;
  category: string;
  qr_payload: string;
  is_present: boolean;
  checked_in_at: string | null;
  checkin_method: string | null;
  is_walkin: boolean;
  pax: number;
  notes?: string;
}

export interface Stats {
  total: number;
  present: number;
  absent: number;
  percentage: number;
}

export interface CheckinResponse {
  status: 'success' | 'duplicate' | 'not_found' | 'error';
  message: string;
  guest?: Guest;
  stats?: Stats;
  query?: string;
}
