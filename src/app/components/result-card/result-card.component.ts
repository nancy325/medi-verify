import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild
} from '@angular/core';

import { MedicineResult, RedFlag } from '../../models/medicine.model';

@Component({
  selector: 'app-result-card',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      *ngIf="result"
      class="glass-card result-card card-3d"
      [class.authentic]="isAuthentic(result)"
      [class.suspicious]="!isAuthentic(result)"
      style="animation: slideInUp 0.5s ease-out both; animation-delay: 0.2s;"
    >
      <!-- Top Section: Score + Summary -->
      <div class="result-top">
        <!-- Circular Progress -->
        <div class="score-ring-container">
          <svg class="score-ring" viewBox="0 0 120 120">
            <!-- Background ring -->
            <circle
              cx="60" cy="60" r="52"
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              stroke-width="8"
            />
            <!-- Score ring -->
            <circle
              #scoreCircle
              cx="60" cy="60" r="52"
              fill="none"
              [attr.stroke]="getScoreColor(result.authenticity_score)"
              stroke-width="8"
              stroke-linecap="round"
              [style.stroke-dasharray]="circumference"
              [style.stroke-dashoffset]="currentOffset"
              class="score-circle"
              transform="rotate(-90 60 60)"
            />
          </svg>
          <div class="score-value">
            <span class="score-number" [style.color]="getScoreColor(result.authenticity_score)">
              {{ displayScore }}
            </span>
            <span class="score-percent">%</span>
          </div>
          <div class="score-glow" [style.background]="'radial-gradient(circle, ' + getScoreColor(result.authenticity_score) + '20, transparent 70%)'"></div>
        </div>

        <!-- Summary -->
        <div class="result-info">
          <h3 class="result-title">Authenticity Score</h3>
          <div
            class="summary-badge"
            [class.badge-green]="isAuthentic(result)"
            [class.badge-red]="!isAuthentic(result)"
          >
            {{ result.summary }}
          </div>
        </div>
      </div>

      <!-- Red Flags Section -->
      <div class="red-flags-section" *ngIf="result.red_flags.length > 0">
        <h4 class="section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          Red Flags Detected
        </h4>

        <div class="flags-list">
          <div
            *ngFor="let redFlag of result.red_flags; let i = index; trackBy: trackByFlag"
            class="flag-item"
            [style.animation-delay]="(0.1 * (i + 1)) + 's'"
          >
            <div class="flag-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </div>
            <div class="flag-content">
              <p class="flag-text">{{ redFlag.flag }}</p>
            </div>
            <div class="flag-confidence" [style.color]="getConfidenceColor(redFlag.confidence)">
              {{ redFlag.confidence }}%
            </div>
          </div>
        </div>
      </div>

      <!-- No Red Flags -->
      <div *ngIf="result.red_flags.length === 0" class="no-flags">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span>No red flags detected — looking good!</span>
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; }

    .result-card {
      padding: 2rem;
      position: relative;
      overflow: hidden;
    }
    .result-card.authentic {
      border-color: rgba(52, 211, 153, 0.3);
    }
    .result-card.suspicious {
      border-color: rgba(248, 113, 113, 0.3);
    }
    .result-card.authentic:hover {
      border-color: rgba(52, 211, 153, 0.5);
    }
    .result-card.suspicious:hover {
      border-color: rgba(248, 113, 113, 0.5);
    }

    .result-top {
      display: flex;
      align-items: center;
      gap: 2rem;
    }

    /* ─── Circular Score ─── */
    .score-ring-container {
      position: relative;
      width: 120px;
      height: 120px;
      flex-shrink: 0;
    }
    .score-ring {
      width: 100%;
      height: 100%;
    }
    .score-circle {
      transition: stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .score-value {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      align-items: baseline;
    }
    .score-number {
      font-family: var(--font-display);
      font-size: 2rem;
      font-weight: 800;
      line-height: 1;
    }
    .score-percent {
      font-family: var(--font-display);
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-secondary);
    }
    .score-glow {
      position: absolute;
      top: -10px;
      left: -10px;
      width: calc(100% + 20px);
      height: calc(100% + 20px);
      border-radius: 50%;
      pointer-events: none;
      animation: pulse 3s ease-in-out infinite;
    }

    .result-info {
      flex: 1;
      min-width: 0;
    }
    .result-title {
      font-family: var(--font-display);
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }
    .summary-badge {
      padding: 0.75rem 1rem;
      border-radius: 12px;
      font-size: 0.875rem;
      font-weight: 600;
      line-height: 1.5;
    }
    .badge-green {
      background: rgba(52, 211, 153, 0.12);
      color: var(--accent-green);
      border: 1px solid rgba(52, 211, 153, 0.2);
    }
    .badge-red {
      background: rgba(248, 113, 113, 0.12);
      color: var(--accent-red);
      border: 1px solid rgba(248, 113, 113, 0.2);
    }

    /* ─── Red Flags ─── */
    .red-flags-section {
      margin-top: 1.5rem;
      padding-top: 1.5rem;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }
    .section-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-family: var(--font-display);
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--accent-red);
      margin-bottom: 1rem;
    }
    .flags-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .flag-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      animation: slideInUp 0.4s ease-out both;
      transition: border-color 0.3s ease, background 0.3s ease, transform 0.2s ease;
    }
    .flag-item:hover {
      border-color: rgba(248, 113, 113, 0.3);
      background: rgba(248, 113, 113, 0.06);
      transform: translateX(4px);
    }
    .flag-icon {
      color: var(--accent-red);
      flex-shrink: 0;
      opacity: 0.8;
    }
    .flag-content {
      flex: 1;
      min-width: 0;
    }
    .flag-text {
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--text-primary);
    }
    .flag-confidence {
      font-family: var(--font-display);
      font-size: 0.85rem;
      font-weight: 700;
      flex-shrink: 0;
    }

    .no-flags {
      margin-top: 1.5rem;
      padding-top: 1.5rem;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      gap: 0.75rem;
      color: var(--accent-green);
      font-weight: 600;
      font-size: 0.9rem;
    }

    @media (max-width: 640px) {
      .result-top {
        flex-direction: column;
        text-align: center;
      }
      .result-card {
        padding: 1.5rem;
      }
    }
  `]
})
export class ResultCardComponent implements AfterViewInit, OnChanges {
  @Input({ required: true }) result: MedicineResult | null = null;

  readonly circumference = 2 * Math.PI * 52; // ~326.73
  currentOffset = this.circumference; // start full (empty ring)
  displayScore = 0;

  private animationFrameId: number | null = null;

  constructor(private readonly cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    if (this.result) {
      setTimeout(() => this.animateScore(this.result!.authenticity_score), 300);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['result'] && this.result) {
      this.displayScore = 0;
      this.currentOffset = this.circumference;
      setTimeout(() => this.animateScore(this.result!.authenticity_score), 300);
    }
  }

  isAuthentic(result: MedicineResult): boolean {
    return result.authenticity_score >= 75;
  }

  getScoreColor(score: number): string {
    if (score >= 80) return 'var(--accent-green)';
    if (score >= 60) return 'var(--accent-yellow)';
    return 'var(--accent-red)';
  }

  getConfidenceColor(confidence: number): string {
    if (confidence >= 80) return 'var(--accent-red)';
    if (confidence >= 50) return 'var(--accent-yellow)';
    return 'var(--text-secondary)';
  }

  trackByFlag(_index: number, item: RedFlag): string {
    return item.flag;
  }

  private animateScore(targetScore: number): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    const duration = 1500;
    const startTime = performance.now();
    const startOffset = this.circumference;
    const targetOffset = this.circumference - (targetScore / 100) * this.circumference;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);

      this.displayScore = Math.round(eased * targetScore);
      this.currentOffset = startOffset + (targetOffset - startOffset) * eased;
      this.cdr.markForCheck();

      if (progress < 1) {
        this.animationFrameId = requestAnimationFrame(animate);
      }
    };

    this.animationFrameId = requestAnimationFrame(animate);
  }
}
