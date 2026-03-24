export interface RedFlag {
  flag: string;
  confidence: number | null;
}

export interface AiExplanation {
  area: string;
  issue: string;
  detail: string;
}

export interface OcrValidationIssue {
  severity: 'CRITICAL' | 'WARNING' | 'MINOR';
  field: string;
  observation: string;
}

export interface OcrExtractedFields {
  drugName: string | null;
  dosage: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  manufacturer: string | null;
  rxSymbol: boolean;
}

export interface OcrResult {
  raw_text: string;
  confidence?: number;
  extracted_fields: OcrExtractedFields;
  matched_drug: string | null;
  validation_issues: OcrValidationIssue[];
  source?: string;
}

export interface FdaResult {
  checked: boolean;
  matched: boolean;
  source: string;
  query: string | null;
  message: string;
  score?: number;
  generic_name?: string | null;
  brand_name?: string | null;
  manufacturer_name?: string | null;
  product_type?: string | null;
  error?: string;
}

export interface VisionResult {
  score: number;
  flags: string[];
  source: 'gemini' | 'opencv' | 'none' | 'quality_gate' | 'fallback_neutral' | 'error';
  metrics?: Record<string, number>;
  rawResponse?: Record<string, unknown>;
  geminiError?: string;
  opencvError?: string;
}

export interface ValidationFlag {
  flag: string;
  severity: string;
}

export interface ValidationResult {
  score?: number;
  flags?: ValidationFlag[];
  details?: Record<string, unknown>;
}

export interface ScoringBreakdown {
  vision_score: number;
  vision_source: string;
  ocr_confidence: number;
  validation_score: number;
  fda_score: number;
  hard_flags: {
    likelyFake: boolean;
    reasons: string[];
  };
  formula: string;
}

export interface ModelUsedInfo {
  vision?: string | null;
  ocr?: string | null;
  quality?: string | null;
  validation?: string | null;
  core_vqa?: string | null;
  fallback_vqa?: string | null;
  clip?: string | null;
  mode?: string;
  images_analyzed?: number;
}

export interface MedicineResult {
  authenticity_score: number;
  status?: 'REAL' | 'SUSPICIOUS' | 'LIKELY FAKE';
  red_flags: RedFlag[];
  summary: string;
  ai_explanations?: AiExplanation[];
  vision?: VisionResult;
  ocr?: OcrResult;
  validation?: ValidationResult;
  fda?: FdaResult;
  scoring_breakdown?: ScoringBreakdown;
  model_used?: string | ModelUsedInfo;
  image_count?: number;
  per_image_results?: MedicineResult[];
}

export interface SellerInfo {
  name: string;
  rating: number;
  reviews: number;
  trustScore: number;
  isVerified: boolean;
}
