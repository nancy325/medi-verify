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
      <div
        class="rounded-xl border-2 border-dashed bg-white p-6 shadow-lg transition-colors"
        [ngClass]="{
          'border-blue-500 bg-blue-50/50': isDragActive,
          'border-slate-300 hover:border-blue-500': !isDragActive
        }"
        (dragover)="onDragOver($event)"
        (dragleave)="onDragLeave($event)"
        (drop)="onDrop($event)"
      >
        <input
          #fileInput
          class="hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          (change)="onFileSelected($event)"
        />

        <div class="flex flex-col items-center justify-center gap-4 text-center">
          <div class="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-700">
            <span class="text-2xl font-bold">↑</span>
          </div>

          <div class="space-y-1">
            <p class="text-lg font-semibold text-slate-900">
              Upload medicine strip photo
            </p>
            <p class="text-sm text-slate-600">
              Drag and drop or choose a file (PNG/JPG/WebP, up to 10MB)
            </p>
          </div>

          <div class="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              class="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow
                transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              (click)="openFilePicker()"
              [disabled]="isLoading"
            >
              Choose image
            </button>

            <button
              type="button"
              class="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm
                font-semibold text-slate-700 shadow-sm transition hover:border-blue-500
                focus:outline-none focus:ring-2 focus:ring-blue-500"
              (click)="reset()"
              [disabled]="isLoading"
            >
              Reset
            </button>
          </div>

          <div *ngIf="previewSrc" class="w-full max-w-md">
            <img
              [src]="previewSrc"
              loading="lazy"
              alt="Uploaded medicine strip preview"
              class="mt-2 w-full rounded-lg border border-slate-200 shadow-sm"
            />
          </div>
        </div>
      </div>

      <div *ngIf="isLoading" class="mt-4 rounded-xl bg-white p-6 shadow-lg">
        <div class="flex items-center gap-4">
          <div
            class="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600"
            aria-label="Loading"
          ></div>
          <div class="space-y-1">
            <p class="font-semibold text-slate-900">Analyzing image…</p>
            <p class="text-sm text-slate-600">This typically takes a few seconds.</p>
          </div>
        </div>
      </div>

      <div
        *ngIf="errorMessage"
        class="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        role="alert"
      >
        {{ errorMessage }}
      </div>
    </section>
  `
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
    if (!file) {
      return;
    }

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
      return 'Image is too large. Maximum size is 10MB.';
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
    if (!this.previewObjectUrl) {
      return;
    }

    URL.revokeObjectURL(this.previewObjectUrl);
    this.previewObjectUrl = null;
  }
}

