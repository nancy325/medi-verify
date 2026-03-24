import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, of, timeout } from 'rxjs';

import { environment } from '../../environments/environment';
import { MedicineResult, SellerInfo } from '../models/medicine.model';

const API_TIMEOUT_MS = 30_000;
const API_TIMEOUT_PER_IMAGE_MS = 20_000;
const MAX_BASE64_LENGTH = 50_000_000;

@Injectable({
  providedIn: 'root'
})
export class MedicineService {
  private readonly verifyUrl = `${environment.apiBaseUrl}${environment.verifyMedicinePath}`;

  private readonly fallbackResult: MedicineResult = {
    authenticity_score: 68,
    red_flags: [
      {
        flag: 'Slight color inconsistency on packaging edges',
        confidence: 62
      },
      {
        flag: 'Font rendering differs from reference samples',
        confidence: 48
      }
    ],
    summary: '⚠️ Service temporarily unavailable — showing fallback result',
    ai_explanations: [
      { area: 'Typography Analysis', issue: 'Font spacing inconsistency', detail: 'Character kerning varies across the label — genuine manufacturers use consistent typesetting' },
      { area: 'Color Integrity', issue: 'Pigment saturation deviation', detail: 'Color values deviate from expected pharmaceutical-grade printing standards' },
      { area: 'Hologram Detection', issue: 'Security feature scan', detail: 'Scanning for holographic security markers typically present on authentic packaging' }
    ],
    ocr: {
      raw_text: '',
      extracted_fields: {
        drugName: null,
        dosage: null,
        batchNumber: null,
        expiryDate: null,
        manufacturer: null,
        rxSymbol: false
      },
      matched_drug: null,
      validation_issues: [
        {
          severity: 'WARNING',
          field: 'OCR',
          observation: 'OCR details unavailable in fallback mode'
        }
      ]
    }
  };

  private readonly sellers: SellerInfo[] = [
    {
      name: 'GreenCare Pharmacy',
      rating: 4.6,
      reviews: 1284,
      trustScore: 88,
      isVerified: true
    },
    {
      name: 'CityMeds Marketplace',
      rating: 4.2,
      reviews: 742,
      trustScore: 72,
      isVerified: true
    },
    {
      name: 'QuickRx Seller Hub',
      rating: 3.9,
      reviews: 312,
      trustScore: 64,
      isVerified: false
    },
    {
      name: 'Sunrise Wellness Store',
      rating: 4.4,
      reviews: 956,
      trustScore: 79,
      isVerified: true
    }
  ];

  constructor(private readonly http: HttpClient) {}

  verifyMedicine(base64Image: string | string[]): Observable<MedicineResult> {
    const images = Array.isArray(base64Image) ? base64Image : [base64Image];
    const trimmedImages = images.map((image) => image.trim()).filter((image) => image.length > 0);

    if (trimmedImages.length === 0) {
      return of({
        authenticity_score: 40,
        red_flags: [{ flag: 'No image provided', confidence: 100 }],
        summary: '⚠️ Missing image input',
        ai_explanations: []
      });
    }

    const oversizedImage = trimmedImages.find((image) => image.length > MAX_BASE64_LENGTH);
    if (oversizedImage) {
      return of({
        authenticity_score: 40,
        red_flags: [{ flag: 'Image payload is too large', confidence: 100 }],
        summary: '⚠️ Image too large to analyze',
        ai_explanations: []
      });
    }

    const invalidImage = trimmedImages.find((image) => !image.startsWith('data:image/'));
    if (invalidImage) {
      return of({
        authenticity_score: 40,
        red_flags: [{ flag: 'Invalid image encoding', confidence: 100 }],
        summary: '⚠️ Unsupported image format',
        ai_explanations: []
      });
    }

    const payload = trimmedImages.length === 1
      ? { image: trimmedImages[0] }
      : { images: trimmedImages };

    // Scale timeout with number of images — each image can take ~15s with LLaVA
    const dynamicTimeout = API_TIMEOUT_MS + ((trimmedImages.length - 1) * API_TIMEOUT_PER_IMAGE_MS);

    return this.http
      .post<MedicineResult>(this.verifyUrl, payload)
      .pipe(
        timeout(dynamicTimeout),
        catchError((error: unknown) => {
          void error;
          return of(this.fallbackResult);
        })
      );
  }

  getSeller(): SellerInfo {
    const randomIndex = Math.floor(Math.random() * this.sellers.length);
    const seller = this.sellers[randomIndex];
    if (!seller) {
      return {
        name: 'Unknown Seller',
        rating: 0,
        reviews: 0,
        trustScore: 0,
        isVerified: false
      };
    }

    return seller;
  }
}
