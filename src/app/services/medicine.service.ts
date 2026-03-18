import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, of, timeout } from 'rxjs';

import { environment } from '../../environments/environment';
import { MedicineResult, SellerInfo } from '../models/medicine.model';

const API_TIMEOUT_MS = 8_000;
const MAX_BASE64_LENGTH = 50_000_000;

@Injectable({
  providedIn: 'root'
})
export class MedicineService {
  private readonly verifyUrl = `${environment.apiBaseUrl}${environment.verifyMedicinePath}`;

  private readonly fallbackResult: MedicineResult = {
    authenticity_score: 60,
    red_flags: [
      {
        flag: 'Unable to analyze image right now. Please try again.',
        confidence: 50
      }
    ],
    summary: '⚠️ Service temporarily unavailable (showing fallback result)'
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

  /**
   * Verifies a medicine image for authenticity indicators.
   * Uses a timeout and returns a safe fallback result on failure.
   */
  verifyMedicine(base64Image: string): Observable<MedicineResult> {
    const trimmedImage = base64Image.trim();
    if (trimmedImage.length === 0) {
      return of({
        authenticity_score: 40,
        red_flags: [{ flag: 'No image provided', confidence: 100 }],
        summary: '⚠️ Missing image input'
      });
    }

    // Guard against accidental huge payloads which can degrade performance and crash browsers.
    if (trimmedImage.length > MAX_BASE64_LENGTH) {
      return of({
        authenticity_score: 40,
        red_flags: [{ flag: 'Image payload is too large', confidence: 100 }],
        summary: '⚠️ Image too large to analyze'
      });
    }

    if (!trimmedImage.startsWith('data:image/')) {
      return of({
        authenticity_score: 40,
        red_flags: [{ flag: 'Invalid image encoding', confidence: 100 }],
        summary: '⚠️ Unsupported image format'
      });
    }

    return this.http
      .post<MedicineResult>(this.verifyUrl, { image: trimmedImage })
      .pipe(
        timeout(API_TIMEOUT_MS),
        catchError((error: unknown) => {
          // We return a controlled fallback so the UI can still render a result card.
          // This avoids user confusion during hackathon demos with flaky connectivity.
          void error;

          return of(this.fallbackResult);
        })
      );
  }

  /**
   * Returns a random mock seller to contextualize the verification result.
   */
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

