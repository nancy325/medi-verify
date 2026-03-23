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
              <p class="flag-text">{{ formatRedFlagText(redFlag.flag) }}</p>
            </div>
            <div
              class="flag-confidence"
              *ngIf="getConfidencePercent(redFlag.confidence) as confText"
              [style.color]="getConfidenceColor(redFlag.confidence)"
            >
              {{ confText }}
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

      <!-- OCR Evidence Panel -->
      <div class="ocr-panel" *ngIf="result.ocr">
        <h4 class="ocr-title">What we read from this package</h4>

        <div class="model-info" *ngIf="getModelSummary(result) as modelSummary">
          <span class="model-label">Models used:</span>
          <span class="model-value">{{ modelSummary }}</span>
        </div>

        <div class="ocr-grid">
          <div class="ocr-row">
            <span class="ocr-label">Drug Name</span>
            <span class="ocr-value">{{ displayField(result.ocr.extracted_fields.drugName, 'Not clearly visible') }}</span>
            <span class="ocr-state" [class.ok]="!!result.ocr.extracted_fields.drugName" [class.warn]="!result.ocr.extracted_fields.drugName">
              {{ result.ocr.extracted_fields.drugName ? '✅' : '⚠️' }}
            </span>
          </div>

          <div class="ocr-row">
            <span class="ocr-label">Dosage</span>
            <span class="ocr-value">{{ displayField(result.ocr.extracted_fields.dosage, 'Not clearly visible') }}</span>
            <span class="ocr-state" [class.ok]="!!result.ocr.extracted_fields.dosage" [class.warn]="!result.ocr.extracted_fields.dosage">
              {{ result.ocr.extracted_fields.dosage ? '✅' : '⚠️' }}
            </span>
          </div>

          <div class="ocr-row">
            <span class="ocr-label">Batch No.</span>
            <span class="ocr-value">{{ displayField(result.ocr.extracted_fields.batchNumber, 'Not found') }}</span>
            <span class="ocr-state" [class.ok]="!!result.ocr.extracted_fields.batchNumber" [class.warn]="!result.ocr.extracted_fields.batchNumber">
              {{ result.ocr.extracted_fields.batchNumber ? '✅' : '⚠️' }}
            </span>
          </div>

          <div class="ocr-row">
            <span class="ocr-label">Expiry</span>
            <span class="ocr-value">{{ displayField(result.ocr.extracted_fields.expiryDate, 'Not clearly visible') }}</span>
            <span class="ocr-state" [class.ok]="!!result.ocr.extracted_fields.expiryDate" [class.warn]="!result.ocr.extracted_fields.expiryDate">
              {{ result.ocr.extracted_fields.expiryDate ? '✅' : '⚠️' }}
            </span>
          </div>

          <div class="ocr-row">
            <span class="ocr-label">Rx Symbol</span>
            <span class="ocr-value">{{ result.ocr.extracted_fields.rxSymbol ? 'Present' : 'Not detected' }}</span>
            <span class="ocr-state" [class.ok]="result.ocr.extracted_fields.rxSymbol" [class.warn]="!result.ocr.extracted_fields.rxSymbol">
              {{ result.ocr.extracted_fields.rxSymbol ? '✅' : '⚠️' }}
            </span>
          </div>

          <div class="ocr-row" *ngIf="result.fda">
            <span class="ocr-label">FDA Match</span>
            <span class="ocr-value">
              {{ result.fda.matched ? 'Matched in openFDA' : 'Not matched in openFDA' }}
            </span>
            <span class="ocr-state" [class.ok]="result.fda.matched" [class.warn]="!result.fda.matched">
              {{ result.fda.matched ? '✅' : '⚠️' }}
            </span>
          </div>
        </div>

        <div class="fda-details" *ngIf="result.fda?.checked">
          <span class="fda-meta" *ngIf="result.fda?.brand_name">Brand: {{ result.fda?.brand_name }}</span>
          <span class="fda-meta" *ngIf="result.fda?.generic_name">Generic: {{ result.fda?.generic_name }}</span>
          <span class="fda-meta" *ngIf="result.fda?.manufacturer_name">Manufacturer: {{ result.fda?.manufacturer_name }}</span>
          <span class="fda-note">{{ result.fda?.message }}</span>
        </div>

        <div class="raw-text" *ngIf="result.ocr.raw_text">
          <span class="raw-text-label">Raw text detected:</span>
          <p class="raw-text-content">{{ result.ocr.raw_text }}</p>
        </div>
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

    .ocr-panel {
      margin-top: 1.5rem;
      padding: 1rem;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .model-info {
      margin-bottom: 0.75rem;
      padding: 0.5rem 0.65rem;
      border-radius: 8px;
      background: rgba(99, 102, 241, 0.12);
      border: 1px solid rgba(99, 102, 241, 0.25);
      font-size: 0.76rem;
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }
    .model-label {
      color: var(--accent-blue);
      font-weight: 700;
    }
    .model-value {
      color: var(--text-secondary);
      font-weight: 600;
    }
    .ocr-title {
      font-family: var(--font-display);
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 0.75rem;
    }
    .ocr-grid {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .ocr-row {
      display: grid;
      grid-template-columns: 110px 1fr auto;
      align-items: center;
      gap: 0.75rem;
      padding: 0.4rem 0;
    }
    .ocr-label {
      color: var(--text-secondary);
      font-size: 0.8rem;
      font-weight: 600;
    }
    .ocr-value {
      color: var(--text-primary);
      font-size: 0.86rem;
      font-weight: 500;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ocr-state {
      font-size: 0.95rem;
      line-height: 1;
    }
    .raw-text {
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px dashed rgba(255, 255, 255, 0.12);
    }
    .fda-details {
      margin-top: 0.6rem;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .fda-meta {
      display: inline-flex;
      align-items: center;
      padding: 0.2rem 0.55rem;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: var(--text-secondary);
      font-size: 0.72rem;
      font-weight: 600;
    }
    .fda-note {
      width: 100%;
      color: var(--text-secondary);
      font-size: 0.75rem;
      line-height: 1.45;
      margin-top: 0.1rem;
    }
    .raw-text-label {
      display: block;
      color: var(--text-secondary);
      font-size: 0.78rem;
      margin-bottom: 0.25rem;
    }
    .raw-text-content {
      color: var(--text-primary);
      font-size: 0.8rem;
      line-height: 1.5;
      word-break: break-word;
    }

    @media (max-width: 640px) {
      .result-top {
        flex-direction: column;
        text-align: center;
      }
      .result-card {
        padding: 1.5rem;
      }
      .ocr-row {
        grid-template-columns: 90px 1fr auto;
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

  getConfidenceColor(confidence: number | null): string {
    if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return 'var(--text-secondary)';
    if (confidence >= 80) return 'var(--accent-red)';
    if (confidence >= 50) return 'var(--accent-yellow)';
    return 'var(--text-secondary)';
  }

  trackByFlag(_index: number, item: RedFlag): string {
    return item.flag;
  }

  formatRedFlagText(flag: string): string {
    const f = String(flag || '').toLowerCase();

    // Hide raw model/processing failures from the user.
    if (f.includes('visual model inference unavailable')) {
      return 'Some visual checks could not be completed. Consider manual verification.';
    }

    if (f.includes('ocr not executed') || f.includes('ocr details unavailable')) {
      return 'Text extraction could not be completed. Please try a clearer, well-lit photo.';
    }

    if (f.includes('no readable text extracted') || f.includes('ocr weak/failed')) {
      return 'We could not reliably read the label text. Please retry with a clearer photo.';
    }

    if (f.includes('trocr failed')) {
      return 'Text extraction was limited. Please retry for best results.';
    }

    return flag;
  }

  getConfidencePercent(confidence: number | null): string | null {
    if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return null;
    return `${confidence}%`;
  }

  displayField(value: string | null, fallback: string): string {
    if (!value) {
      return fallback;
    }

    return value.trim().length > 0 ? value : fallback;
  }

  getModelSummary(result: MedicineResult): string | null {
    const model = result.model_used;

    if (!model) {
      return null;
    }

    if (typeof model === 'string') {
      return model;
    }

    const parts: string[] = [];
    if (model.vision) parts.push(`Vision: ${model.vision}`);
    if (model.ocr) parts.push(`OCR: ${model.ocr}`);
    if (model.quality) parts.push(`Quality: ${model.quality}`);
    if (model.core_vqa) parts.push(`VQA: ${model.core_vqa}`);
    if (model.fallback_vqa) parts.push(`VQA fallback: ${model.fallback_vqa}`);
    if (model.clip) parts.push(`CLIP: ${model.clip}`);

    return parts.length > 0 ? parts.join(' • ') : null;
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
