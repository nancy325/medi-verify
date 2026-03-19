import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  OnDestroy,
  Output,
  ViewChild
} from '@angular/core';
import { Observable, Subject, finalize, map, switchMap, takeUntil, timer } from 'rxjs';

import { MedicineResult } from '../../models/medicine.model';
import { MedicineService } from '../../services/medicine.service';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MIN_SPINNER_MS = 3_000;
const MAX_SPINNER_MS = 5_000;

@Component({
  selector: 'app-image-upload',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="w-full">
      <!-- Upload Card -->
      <div
        class="upload-card glass-card card-3d"
        [class.drag-active]="isDragActive"
        (dragover)="onDragOver($event)"
        (dragleave)="onDragLeave($event)"
        (drop)="onDrop($event)"
        style="animation: slideInUp 0.5s ease-out both;"
      >
        <input
          #fileInput
          class="hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          (change)="onFileSelected($event)"
        />

        <div class="upload-content">
          <!-- Upload Icon -->
          <div class="upload-icon-wrapper">
            <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div class="upload-icon-ring"></div>
            <div class="upload-icon-ring ring-2"></div>
          </div>

          <div class="upload-text">
            <h3 class="upload-title">Upload Medicine Strip</h3>
            <p class="upload-subtitle">
              Drag & drop or choose a file — PNG, JPG, WebP up to 10 MB
            </p>
          </div>

          <div class="upload-actions">
            <button
              type="button"
              class="btn-primary"
              (click)="openFilePicker()"
              [disabled]="isLoading"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Choose Image
            </button>
            <button
              type="button"
              class="btn-secondary"
              (click)="reset()"
              [disabled]="isLoading"
            >
              Reset
            </button>
          </div>

          <!-- Preview -->
          <div *ngIf="previewSrc" class="preview-container">
            <img
              [src]="previewSrc"
              loading="lazy"
              alt="Uploaded medicine strip preview"
              class="preview-image"
            />
          </div>
        </div>
      </div>

      <!-- AI Analyzing Animation -->
      <div *ngIf="isLoading" class="loading-card glass-card" style="animation: slideInUp 0.4s ease-out both;">
        <div class="loading-content">
          <div class="ai-scanner">
            <div class="scanner-ring ring-outer"></div>
            <div class="scanner-ring ring-middle"></div>
            <div class="scanner-ring ring-inner"></div>
            <div class="scanner-core">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 2a4 4 0 0 1 4 4v1a1 1 0 0 0 1 1h1a4 4 0 0 1 0 8h-1a1 1 0 0 0-1 1v1a4 4 0 0 1-8 0v-1a1 1 0 0 0-1-1H6a4 4 0 0 1 0-8h1a1 1 0 0 0 1-1V6a4 4 0 0 1 4-4z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
          </div>
          <div class="loading-text">
            <h4>AI is analyzing your image…</h4>
            <p>Running BLIP-2 vision model • Checking authenticity markers</p>
            <div class="loading-bar">
              <div class="loading-bar-fill"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Error -->
      <div
        *ngIf="errorMessage"
        class="error-card glass-card"
        role="alert"
        style="animation: slideInUp 0.4s ease-out both;"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 8v4M12 16h.01"/>
        </svg>
        <span>{{ errorMessage }}</span>
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; }

    .upload-card {
      padding: 2rem;
      transition: border-color 0.3s ease, transform 0.3s ease;
    }
    .upload-card.drag-active {
      border-color: var(--accent-blue) !important;
      box-shadow: 0 0 30px rgba(99, 102, 241, 0.3);
    }

    .upload-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1.25rem;
      text-align: center;
    }

    .upload-icon-wrapper {
      position: relative;
      width: 72px;
      height: 72px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .upload-icon {
      width: 32px;
      height: 32px;
      color: var(--accent-blue);
      z-index: 2;
      position: relative;
    }
    .upload-icon-ring {
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      border: 2px solid rgba(99, 102, 241, 0.2);
      animation: pulse-ring 2.5s ease-out infinite;
    }
    .upload-icon-ring.ring-2 {
      animation-delay: 1.25s;
    }
    @keyframes pulse-ring {
      0%   { transform: scale(0.8); opacity: 0.8; }
      100% { transform: scale(1.6); opacity: 0; }
    }

    .upload-title {
      font-family: var(--font-display);
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--text-primary);
    }
    .upload-subtitle {
      font-size: 0.875rem;
      color: var(--text-secondary);
      margin-top: 0.25rem;
    }

    .upload-actions {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
      justify-content: center;
    }

    .btn-primary {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 0.75rem 1.5rem;
      border-radius: 12px;
      border: none;
      background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
      color: white;
      font-weight: 600;
      font-size: 0.875rem;
      font-family: var(--font-body);
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
    }
    .btn-primary:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(99, 102, 241, 0.5);
    }
    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-secondary {
      padding: 0.75rem 1.5rem;
      border-radius: 12px;
      border: 1px solid var(--glass-border);
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-secondary);
      font-weight: 600;
      font-size: 0.875rem;
      font-family: var(--font-body);
      cursor: pointer;
      transition: border-color 0.2s ease, color 0.2s ease, background 0.2s ease;
    }
    .btn-secondary:hover:not(:disabled) {
      border-color: var(--accent-blue);
      color: var(--text-primary);
      background: rgba(99, 102, 241, 0.1);
    }
    .btn-secondary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .preview-container {
      width: 100%;
      max-width: 400px;
    }
    .preview-image {
      width: 100%;
      border-radius: 12px;
      border: 1px solid var(--glass-border);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }

    /* ─── Loading Card ─── */
    .loading-card {
      margin-top: 1rem;
      padding: 1.5rem;
    }
    .loading-content {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }

    .ai-scanner {
      position: relative;
      width: 64px;
      height: 64px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .scanner-ring {
      position: absolute;
      border-radius: 50%;
      border: 2px solid transparent;
    }
    .ring-outer {
      width: 100%;
      height: 100%;
      border-top-color: var(--accent-blue);
      border-right-color: var(--accent-purple);
      animation: spin 2s linear infinite;
    }
    .ring-middle {
      width: 80%;
      height: 80%;
      border-bottom-color: var(--accent-cyan);
      border-left-color: var(--accent-blue);
      animation: spin 1.5s linear infinite reverse;
    }
    .ring-inner {
      width: 60%;
      height: 60%;
      border-top-color: var(--accent-purple);
      animation: spin 1s linear infinite;
    }
    .scanner-core {
      z-index: 2;
      color: var(--accent-purple);
      animation: pulse 1.5s ease-in-out infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.15); opacity: 0.7; }
    }

    .loading-text h4 {
      font-family: var(--font-display);
      font-weight: 700;
      font-size: 1rem;
      color: var(--text-primary);
    }
    .loading-text p {
      font-size: 0.8rem;
      color: var(--text-secondary);
      margin-top: 0.25rem;
    }
    .loading-bar {
      margin-top: 0.75rem;
      width: 100%;
      height: 4px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 2px;
      overflow: hidden;
    }
    .loading-bar-fill {
      height: 100%;
      width: 40%;
      background: linear-gradient(90deg, var(--accent-blue), var(--accent-purple), var(--accent-cyan));
      border-radius: 2px;
      animation: loadingSlide 2s ease-in-out infinite;
    }
    @keyframes loadingSlide {
      0%   { transform: translateX(-100%); }
      50%  { transform: translateX(200%); }
      100% { transform: translateX(-100%); }
    }

    /* ─── Error Card ─── */
    .error-card {
      margin-top: 1rem;
      padding: 1rem 1.25rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      border-color: rgba(248, 113, 113, 0.3) !important;
      color: #fca5a5;
      font-size: 0.875rem;
    }

    @media (max-width: 640px) {
      .loading-content {
        flex-direction: column;
        text-align: center;
      }
    }
  `]
})
export class ImageUploadComponent implements OnDestroy {
  @Output() resultFound = new EventEmitter<MedicineResult>();

  @ViewChild('fileInput', { static: true })
  private readonly fileInputRef?: ElementRef<HTMLInputElement>;

  isDragActive = false;
  isLoading = false;
  errorMessage: string | null = null;
  previewSrc: string | null = null;

  private readonly destroy$ = new Subject<void>();
  private previewObjectUrl: string | null = null;

  constructor(
    private readonly medicineService: MedicineService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  openFilePicker(): void {
    const input = this.fileInputRef?.nativeElement;
    if (!input) {
      this.errorMessage = 'File picker is unavailable. Please refresh and try again.';
      this.cdr.markForCheck();
      return;
    }
    input.click();
  }

  reset(): void {
    this.errorMessage = null;
    this.revokePreviewObjectUrl();
    this.previewSrc = null;
    this.isLoading = false;

    const input = this.fileInputRef?.nativeElement;
    if (input) {
      input.value = '';
    }
    this.cdr.markForCheck();
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragActive = true;
    this.cdr.markForCheck();
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragActive = false;
    this.cdr.markForCheck();
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragActive = false;

    const file = event.dataTransfer?.files?.item(0) ?? null;
    if (!file) {
      this.errorMessage = 'No file detected. Please try again.';
      this.cdr.markForCheck();
      return;
    }
    this.processFile(file);
  }

  onFileSelected(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      this.errorMessage = 'Unexpected input source. Please try again.';
      this.cdr.markForCheck();
      return;
    }

    const file = target.files?.item(0) ?? null;
    if (!file) { return; }
    this.processFile(file);
  }

  ngOnDestroy(): void {
    this.revokePreviewObjectUrl();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private processFile(file: File): void {
    this.errorMessage = null;

    const validationError = this.validateImageFile(file);
    if (validationError) {
      this.errorMessage = validationError;
      this.cdr.markForCheck();
      return;
    }

    this.isLoading = true;
    this.revokePreviewObjectUrl();
    this.previewObjectUrl = URL.createObjectURL(file);
    this.previewSrc = this.previewObjectUrl;
    this.cdr.markForCheck();

    const spinnerTargetMs = this.getSpinnerTargetMs();
    const startMs = Date.now();

    this.fileToBase64(file)
      .pipe(
        switchMap((base64Image: string) =>
          this.medicineService.verifyMedicine(base64Image).pipe(
            switchMap((result: MedicineResult) => {
              const elapsedMs = Date.now() - startMs;
              const remainingMs = Math.max(0, spinnerTargetMs - elapsedMs);
              return timer(remainingMs).pipe(map(() => result));
            })
          )
        ),
        takeUntil(this.destroy$),
        finalize(() => {
          this.isLoading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (result: MedicineResult) => {
          this.resultFound.emit(result);
          this.cdr.markForCheck();
        },
        error: () => {
          this.errorMessage = 'Failed to analyze image. Please try again.';
          this.cdr.markForCheck();
        }
      });
  }

  private validateImageFile(file: File): string | null {
    const allowedTypes = new Set<string>(['image/png', 'image/jpeg', 'image/webp']);
    if (!allowedTypes.has(file.type)) {
      return 'Unsupported file type. Please upload a PNG, JPG, or WebP image.';
    }
    if (file.size <= 0) {
      return 'Empty file detected. Please upload a valid image.';
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return 'Image is too large. Maximum size is 10 MB.';
    }
    return null;
  }

  private fileToBase64(file: File): Observable<string> {
    return new Observable<string>((subscriber) => {
      const reader = new FileReader();
      reader.onerror = () => {
        subscriber.error(new Error('FILE_READ_FAILED'));
      };
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string' || !result.startsWith('data:image/')) {
          subscriber.error(new Error('INVALID_BASE64'));
          return;
        }
        subscriber.next(result);
        subscriber.complete();
      };
      reader.readAsDataURL(file);
      return () => {
        if (reader.readyState === FileReader.LOADING) {
          reader.abort();
        }
      };
    });
  }

  private getSpinnerTargetMs(): number {
    const range = MAX_SPINNER_MS - MIN_SPINNER_MS;
    return MIN_SPINNER_MS + Math.floor(Math.random() * (range + 1));
  }

  private revokePreviewObjectUrl(): void {
    if (!this.previewObjectUrl) { return; }
    URL.revokeObjectURL(this.previewObjectUrl);
    this.previewObjectUrl = null;
  }
}
