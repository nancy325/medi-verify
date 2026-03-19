export interface RedFlag {
  flag: string;
  confidence: number;
}

export interface AiExplanation {
  area: string;
  issue: string;
  detail: string;
}

export interface MedicineResult {
  authenticity_score: number;
  red_flags: RedFlag[];
  summary: string;
  ai_explanations?: AiExplanation[];
}

export interface SellerInfo {
  name: string;
  rating: number;
  reviews: number;
  trustScore: number;
  isVerified: boolean;
}
