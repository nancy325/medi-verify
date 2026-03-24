import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  SimpleChanges
} from '@angular/core';

import { SellerInfo } from '../../models/medicine.model';

@Component({
  selector: 'app-seller-info',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      *ngIf="seller"
      class="med-card seller-card"
      style="animation: slideInUp 0.6s ease-out both; animation-delay: 0.3s;"
    >
      <!-- Header -->
      <div class="seller-header">
        <div class="seller-identity">
          <div class="seller-avatar">
            {{ seller.name.charAt(0) }}
          </div>
          <div>
            <h3 class="seller-name">{{ seller.name }}</h3>
            <p class="seller-subtitle">Medicine Supplier</p>
          </div>
        </div>

        <div
          class="verified-badge"
          [class.verified]="seller.isVerified"
          [class.unverified]="!seller.isVerified"
        >
          <svg *ngIf="seller.isVerified" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <svg *ngIf="!seller.isVerified" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4M12 16h.01"/>
          </svg>
          {{ seller.isVerified ? 'Verified' : 'Unverified' }}
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="stats-grid">
        <!-- Trust Score -->
        <div class="stat-card" [class.trust-high]="isTrusted(seller)" [class.trust-low]="!isTrusted(seller)">
          <p class="stat-label">Trust Score</p>
          <div class="stat-value-row">
            <span class="stat-value" [style.color]="isTrusted(seller) ? 'var(--accent-green)' : 'var(--accent-red)'">
              {{ displayTrust }}%
            </span>
          </div>
          <div class="trust-bar">
            <div
              class="trust-bar-fill"
              [style.width.%]="displayTrust"
              [style.background]="isTrusted(seller)
                ? 'linear-gradient(90deg, var(--accent-green), var(--accent-cyan))'
                : 'linear-gradient(90deg, var(--accent-red), var(--accent-yellow))'"
            ></div>
          </div>
        </div>

        <!-- Rating -->
        <div class="stat-card">
          <p class="stat-label">Rating</p>
          <div class="stat-value-row">
            <span class="stat-value">{{ seller.rating }}</span>
            <span class="stat-suffix">/ 5</span>
          </div>
          <div class="stars">
            <span *ngFor="let star of getStars(seller.rating)" class="star" [class.filled]="star" [class.empty]="!star">★</span>
          </div>
        </div>

        <!-- Reviews -->
        <div class="stat-card">
          <p class="stat-label">Reviews</p>
          <div class="stat-value-row">
            <span class="stat-value">{{ seller.reviews | number }}</span>
          </div>
          <p class="stat-extra">Verified purchases</p>
        </div>
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; }

    .seller-card { padding: 1.5rem; }

    .seller-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .seller-identity {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .seller-avatar {
      width: 44px;
      height: 44px;
      border-radius: var(--radius-md);
      background: linear-gradient(135deg, var(--accent-blue), #1D4ED8);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-family: var(--font-display);
      font-weight: 800;
      font-size: 1.1rem;
      box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);
    }

    .seller-name {
      font-family: var(--font-display);
      font-weight: 700;
      font-size: 1.1rem;
      color: var(--text-primary);
    }

    .seller-subtitle {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .verified-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 0.35rem 0.85rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 700;
      font-family: var(--font-display);
    }

    .verified-badge.verified {
      background: var(--accent-green-50);
      color: var(--accent-green);
      border: 1px solid rgba(22, 163, 74, 0.2);
    }

    .verified-badge.unverified {
      background: var(--accent-red-50);
      color: var(--accent-red);
      border: 1px solid rgba(220, 38, 38, 0.2);
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.75rem;
      margin-top: 1.25rem;
    }

    .stat-card {
      background: #F8FAFC;
      border: 1px solid var(--border-light);
      border-radius: var(--radius-md);
      padding: 1rem;
      transition: all 0.2s ease;
    }

    .stat-card:hover {
      border-color: var(--border-medium);
      transform: translateY(-2px);
      box-shadow: var(--shadow-sm);
    }

    .stat-card.trust-high { border-color: rgba(22, 163, 74, 0.2); }
    .stat-card.trust-low { border-color: rgba(220, 38, 38, 0.2); }

    .stat-label {
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.35rem;
    }

    .stat-value-row { display: flex; align-items: baseline; gap: 4px; }

    .stat-value {
      font-family: var(--font-display);
      font-size: 1.35rem;
      font-weight: 800;
      color: var(--text-primary);
    }

    .stat-suffix { font-size: 0.8rem; font-weight: 600; color: var(--text-tertiary); }
    .stat-extra { font-size: 0.7rem; color: var(--text-tertiary); margin-top: 0.25rem; }

    .stars { display: flex; gap: 2px; margin-top: 0.35rem; }
    .star { font-size: 0.85rem; }
    .star.filled { color: #F59E0B; }
    .star.empty { color: #E2E8F0; }

    .trust-bar {
      width: 100%;
      height: 4px;
      background: #E2E8F0;
      border-radius: 2px;
      margin-top: 0.5rem;
      overflow: hidden;
    }

    .trust-bar-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 1.5s cubic-bezier(0.4, 0, 0.2, 1);
    }

    @media (max-width: 640px) {
      .stats-grid { grid-template-columns: 1fr; }
      .seller-header { flex-direction: column; align-items: flex-start; }
    }
  `]
})
export class SellerInfoComponent implements AfterViewInit, OnChanges {
  @Input({ required: true }) seller: SellerInfo | null = null;

  displayTrust = 0;
  private animFrameId: number | null = null;

  constructor(private readonly cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    if (this.seller) {
      setTimeout(() => this.animateTrust(this.seller!.trustScore), 500);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['seller'] && this.seller) {
      this.displayTrust = 0;
      setTimeout(() => this.animateTrust(this.seller!.trustScore), 500);
    }
  }

  isTrusted(seller: SellerInfo): boolean {
    return seller.trustScore >= 70;
  }

  getStars(rating: number): boolean[] {
    const stars: boolean[] = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(i <= Math.round(rating));
    }
    return stars;
  }

  private animateTrust(target: number): void {
    if (this.animFrameId) { cancelAnimationFrame(this.animFrameId); }
    const duration = 1200;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      this.displayTrust = Math.round(eased * target);
      this.cdr.markForCheck();
      if (progress < 1) { this.animFrameId = requestAnimationFrame(animate); }
    };

    this.animFrameId = requestAnimationFrame(animate);
  }
}
