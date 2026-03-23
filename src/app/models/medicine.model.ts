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
  extracted_fields: OcrExtractedFields;
  matched_drug: string | null;
  validation_issues: OcrValidationIssue[];
}

export interface FdaResult {
  checked: boolean;
  matched: boolean;
  source: string;
  query: string | null;
  message: string;
  generic_name?: string | null;
  brand_name?: string | null;
  manufacturer_name?: string | null;
  product_type?: string | null;
  error?: string;
}

export interface ModelUsedInfo {
  quality?: string | null;
  core_vqa?: string | null;
  fallback_vqa?: string | null;
  clip?: string | null;
  vision?: string | null;
  ocr?: string | null;
}

export interface MedicineResult {
  authenticity_score: number;
  red_flags: RedFlag[];
  summary: string;
  ai_explanations?: AiExplanation[];
  ocr?: OcrResult;
  fda?: FdaResult;
  model_used?: string | ModelUsedInfo;
}

export interface SellerInfo {
  name: string;
  rating: number;
  reviews: number;
  trustScore: number;
  isVerified: boolean;
}
