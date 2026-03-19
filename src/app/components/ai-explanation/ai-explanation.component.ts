import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  QueryList,
  ViewChildren
} from '@angular/core';

import { AiExplanation } from '../../models/medicine.model';

@Component({
  selector: 'app-ai-explanation',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="glass-card p-6 card-3d" style="animation: slideInUp 0.6s ease-out both; animation-delay: 0.4s;">
      <!-- Header -->
      <div class="flex items-center gap-3 mb-5">
        <div class="ai-icon-wrapper">
          <svg class="ai-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 2a4 4 0 0 1 4 4v1a1 1 0 0 0 1 1h1a4 4 0 0 1 0 8h-1a1 1 0 0 0-1 1v1a4 4 0 0 1-8 0v-1a1 1 0 0 0-1-1H6a4 4 0 0 1 0-8h1a1 1 0 0 0 1-1V6a4 4 0 0 1 4-4z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </div>
        <div>
          <h3 class="text-lg font-bold" style="font-family: var(--font-display); color: var(--text-primary);">
            AI Analysis Reasoning
          </h3>
          <p class="text-xs" style="color: var(--text-secondary);">
            How our AI evaluated this medicine strip
          </p>
        </div>
      </div>

      <!-- Explanation Cards -->
      <div class="explanation-list">
        <div
          #explanationItem
          *ngFor="let item of explanations; let i = index; trackBy: trackByArea"
          class="explanation-card"
          [style.animation-delay]="(0.1 * (i + 1)) + 's'"
        >
          <div class="explanation-header">
            <div class="area-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4M12 8h.01"/>
              </svg>
              <span>{{ item.area }}</span>
            </div>
          </div>
          <p class="issue-text">{{ item.issue }}</p>
          <p class="detail-text">{{ item.detail }}</p>
          <div class="scan-line"></div>
        </div>
      </div>
    </section>
  `,
  styles: [`
    :host {
      display: block;
    }

    .ai-icon-wrapper {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2));
      display: flex;
      align-items: center;
      justify-content: center;
      animation: pulse-glow 3s ease-in-out infinite;
    }

    .ai-icon {
      width: 24px;
      height: 24px;
      color: var(--accent-purple);
    }

    .explanation-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .explanation-card {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 16px;
      position: relative;
      overflow: hidden;
      animation: slideInUp 0.5s ease-out both;
      transition: border-color 0.3s ease, background 0.3s ease, transform 0.3s ease;
    }

    .explanation-card:hover {
      border-color: rgba(168, 85, 247, 0.4);
      background: rgba(168, 85, 247, 0.06);
      transform: translateX(4px);
    }

    .explanation-card:hover .scan-line {
      opacity: 1;
      animation: scanEffect 1.5s ease-in-out;
    }

    .explanation-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .area-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px;
      border-radius: 20px;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.15));
      color: var(--accent-purple);
      font-size: 0.75rem;
      font-weight: 600;
      font-family: var(--font-display);
    }

    .issue-text {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .detail-text {
      font-size: 0.8rem;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    .scan-line {
      position: absolute;
      top: 0;
      left: -100%;
      width: 50%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(168, 85, 247, 0.08), transparent);
      opacity: 0;
      pointer-events: none;
    }

    @keyframes scanEffect {
      0%   { left: -50%; opacity: 1; }
      100% { left: 100%; opacity: 0; }
    }
  `]
})
export class AiExplanationComponent {
  @Input({ required: true }) explanations: AiExplanation[] = [];

  trackByArea(_index: number, item: AiExplanation): string {
    return item.area;
  }
}
