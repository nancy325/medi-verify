export interface RedFlag {
  flag: string;
  confidence: number;
}

export interface MedicineResult {
  authenticity_score: number;
  red_flags: RedFlag[];
  summary: string;
}

export interface SellerInfo {
  name: string;
  rating: number;
  reviews: number;
  trustScore: number;
  isVerified: boolean;
}

