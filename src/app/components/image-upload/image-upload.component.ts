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
import { Observable, Subject, concatMap, finalize, from, map, switchMap, takeUntil, timer, toArray } from 'rxjs';

import { MedicineResult } from '../../models/medicine.model';
import { MedicineService } from '../../services/medicine.service';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 6;
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
        class="upload-card med-card"
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
          multiple
          accept="image/png,image/jpeg,image/webp"
          (change)="onFileSelected($event)"
        />

        <div class="upload-content">
          <!-- Upload Icon -->
          <div class="upload-icon-wrapper">
            <div class="upload-icon-bg">
              <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div class="upload-icon-ring"></div>
            <div class="upload-icon-ring ring-2"></div>
          </div>

          <div class="upload-text">
            <h3 class="upload-title">Upload Medicine Strip</h3>
            <p class="upload-subtitle">
              Drag & drop or choose up to 6 photos — PNG, JPG, WebP up to 10 MB each
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
              Choose Images
            </button>
            <button
              type="button"
              class="btn-secondary"
              (click)="reset()"
              [disabled]="isLoading"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
              </svg>
              Reset
            </button>
          </div>

          <!-- Preview -->
          <div *ngIf="previewSrcList.length > 0" class="preview-container">
            <div class="preview-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              Selected photos: {{ previewSrcList.length }}
            </div>
            <div class="preview-grid">
              <img
                *ngFor="let src of previewSrcList; let index = index"
                [src]="src"
                loading="lazy"
                [alt]="'Uploaded medicine strip preview ' + (index + 1)"
                class="preview-image"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- AI Analyzing Animation -->
      <div *ngIf="isLoading" class="loading-card med-card" style="animation: fadeInScale 0.4s ease-out both;">
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
            <p>Running vision model • Checking authenticity markers • Cross-referencing FDA</p>
            <div class="loading-bar">
              <div class="loading-bar-fill"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Error -->
      <div
        *ngIf="errorMessage"
        class="error-card"
        role="alert"
        style="animation: fadeInScale 0.3s ease-out both;"
      >
        <div class="error-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4M12 16h.01"/>
          </svg>
        </div>
        <span>{{ errorMessage }}</span>
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; }

    /* ─── Upload Card ─── */
    .upload-card {
      padding: 2.5rem 2rem;
      border: 2px dashed var(--border-light);
      background: var(--bg-card);
      transition: border-color 0.3s ease, box-shadow 0.3s ease;
    }

    .upload-card.drag-active {
      border-color: var(--accent-blue) !important;
      border-style: dashed;
      background: var(--accent-blue-50);
      box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1);
    }

    .upload-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1.25rem;
      text-align: center;
    }

    /* Upload Icon */
    .upload-icon-wrapper {
      position: relative;
      width: 80px;
      height: 80px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .upload-icon-bg {
      width: 64px;
      height: 64px;
      border-radius: var(--radius-lg);
      background: var(--accent-blue-50);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2;
      position: relative;
    }

    .upload-icon {
      width: 28px;
      height: 28px;
      color: var(--accent-blue);
    }

    .upload-icon-ring {
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      border: 2px solid rgba(37, 99, 235, 0.15);
      animation: pulse-ring 2.5s ease-out infinite;
    }

    .upload-icon-ring.ring-2 {
      animation-delay: 1.25s;
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

    /* Action Buttons */
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
      padding: 0.7rem 1.5rem;
      border-radius: var(--radius-md);
      border: none;
      background: var(--accent-blue);
      color: white;
      font-weight: 600;
      font-size: 0.875rem;
      font-family: var(--font-body);
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);
    }

    .btn-primary:hover:not(:disabled) {
      background: #1D4ED8;
      transform: translateY(-1px);
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-secondary {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 0.7rem 1.5rem;
      border-radius: var(--radius-md);
      border: 1px solid var(--border-light);
      background: var(--bg-card);
      color: var(--text-secondary);
      font-weight: 600;
      font-size: 0.875rem;
      font-family: var(--font-body);
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-secondary:hover:not(:disabled) {
      border-color: var(--accent-blue);
      color: var(--accent-blue);
      background: var(--accent-blue-50);
    }

    .btn-secondary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Image Preview */
    .preview-container {
      width: 100%;
      max-width: 560px;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .preview-label {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--text-secondary);
      font-size: 0.82rem;
      font-weight: 500;
    }

    .preview-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 0.75rem;
      width: 100%;
    }

    .preview-image {
      width: 100%;
      aspect-ratio: 4/3;
      object-fit: cover;
      border-radius: var(--radius-md);
      border: 1px solid var(--border-light);
      box-shadow: var(--shadow-sm);
    }

    /* ─── Loading Card ─── */
    .loading-card {
      margin-top: 1rem;
      padding: 1.5rem;
      border-left: 4px solid var(--accent-blue);
    }

    .loading-content {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }

    .ai-scanner {
      position: relative;
      width: 56px;
      height: 56px;
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
      border-right-color: var(--accent-green);
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
      border-top-color: var(--accent-green);
      animation: spin 1s linear infinite;
    }

    .scanner-core {
      z-index: 2;
      color: var(--accent-blue);
      animation: pulse 1.5s ease-in-out infinite;
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
      background: #E2E8F0;
      border-radius: 2px;
      overflow: hidden;
    }

    .loading-bar-fill {
      height: 100%;
      width: 40%;
      background: linear-gradient(90deg, var(--accent-blue), var(--accent-green), var(--accent-cyan));
      border-radius: 2px;
      animation: loadingSlide 2s ease-in-out infinite;
    }

    /* ─── Error Card ─── */
    .error-card {
      margin-top: 1rem;
      padding: 1rem 1.25rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: var(--accent-red-50);
      border: 1px solid rgba(220, 38, 38, 0.2);
      border-radius: var(--radius-md);
      color: var(--accent-red);
      font-size: 0.875rem;
      font-weight: 500;
    }

    .error-icon {
      flex-shrink: 0;
    }

    @media (max-width: 640px) {
      .upload-card { padding: 1.5rem 1rem; }
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
  previewSrcList: string[] = [];

  private readonly destroy$ = new Subject<void>();
  private previewObjectUrls: string[] = [];

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
    this.revokePreviewObjectUrls();
    this.previewSrcList = [];
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

    const fileList = event.dataTransfer?.files;
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) {
      this.errorMessage = 'No file detected. Please try again.';
      this.cdr.markForCheck();
      return;
    }
    this.processFiles(files);
  }

  onFileSelected(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      this.errorMessage = 'Unexpected input source. Please try again.';
      this.cdr.markForCheck();
      return;
    }

    const files = target.files ? Array.from(target.files) : [];
    if (files.length === 0) { return; }
    this.processFiles(files);
  }

  ngOnDestroy(): void {
    this.revokePreviewObjectUrls();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private processFiles(files: File[]): void {
    this.errorMessage = null;

    const validationError = this.validateImageFiles(files);
    if (validationError) {
      this.errorMessage = validationError;
      this.cdr.markForCheck();
      return;
    }

    this.isLoading = true;
    this.revokePreviewObjectUrls();
    this.previewObjectUrls = files.map((file) => URL.createObjectURL(file));
    this.previewSrcList = [...this.previewObjectUrls];
    this.cdr.markForCheck();

    const spinnerTargetMs = this.getSpinnerTargetMs();
    const startMs = Date.now();

    from(files)
      .pipe(
        concatMap((file) => this.fileToBase64(file)),
        toArray(),
        switchMap((base64Images: string[]) =>
          this.medicineService.verifyMedicine(base64Images).pipe(
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

  private validateImageFiles(files: File[]): string | null {
    if (files.length > MAX_FILES) {
      return `Too many files selected. Maximum is ${MAX_FILES} photos.`;
    }

    if (files.length === 0) {
      return 'No image selected. Please upload at least one photo.';
    }

    const allowedTypes = new Set<string>(['image/png', 'image/jpeg', 'image/webp']);
    for (const file of files) {
      if (!allowedTypes.has(file.type)) {
        return 'Unsupported file type. Please upload PNG, JPG, or WebP images only.';
      }
      if (file.size <= 0) {
        return 'Empty file detected. Please upload valid images.';
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return 'One or more images are too large. Maximum size is 10 MB per image.';
      }
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

  private revokePreviewObjectUrls(): void {
    if (this.previewObjectUrls.length === 0) { return; }
    for (const objectUrl of this.previewObjectUrls) {
      URL.revokeObjectURL(objectUrl);
    }
    this.previewObjectUrls = [];
  }
}
