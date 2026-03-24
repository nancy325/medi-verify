import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';

import { ImageUploadComponent } from './components/image-upload/image-upload.component';
import { ResultCardComponent } from './components/result-card/result-card.component';
import { SellerInfoComponent } from './components/seller-info/seller-info.component';
import { AiExplanationComponent } from './components/ai-explanation/ai-explanation.component';
import { MedicineResult, SellerInfo } from './models/medicine.model';
import { MedicineService } from './services/medicine.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    ImageUploadComponent,
    ResultCardComponent,
    SellerInfoComponent,
    AiExplanationComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Animated Background -->
    <div class="animated-bg">
      <div class="floating-orb orb-1"></div>
      <div class="floating-orb orb-2"></div>
      <div class="floating-orb orb-3"></div>
      <div class="floating-orb orb-4"></div>
    </div>

    <!-- Navbar -->
    <nav class="navbar" style="animation: fadeIn 0.4s ease-out both;">
      <div class="navbar-inner">
        <div class="navbar-brand">
          <div class="brand-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <span class="brand-text">MediVerify</span>
        </div>

        <div class="navbar-links">
          <a class="nav-link active">Home</a>
          <a class="nav-link">Verify Medicine</a>
          <a class="nav-link">About</a>
        </div>

        <div class="language-switcher" aria-label="Translate page">
          <button
            type="button"
            class="lang-btn"
            [class.active]="selectedLanguage === 'en'"
            (click)="setLanguage('en')"
          >
            English
          </button>
          <button
            type="button"
            class="lang-btn"
            [class.active]="selectedLanguage === 'hi'"
            (click)="setLanguage('hi')"
          >
            Hindi
          </button>
          <button
            type="button"
            class="lang-btn"
            [class.active]="selectedLanguage === 'gu'"
            (click)="setLanguage('gu')"
          >
            Gujarati
          </button>
        </div>

        <button class="nav-cta" (click)="scrollToUpload()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload Medicine
        </button>
      </div>
    </nav>

    <!-- Main Content -->
    <div class="app-container">
      <main class="main-content">

        <!-- Hero Section -->
        <section class="hero-section" style="animation: slideInUp 0.5s ease-out both;">
          <div class="hero-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            AI-Powered Verification
          </div>

          <h1 class="hero-title">
            AI-Powered Medicine<br/>
            <span class="hero-gradient">Verification</span>
          </h1>

          <p class="hero-subtitle">
            Detect counterfeit medicines instantly using advanced computer vision, OCR analysis, and FDA database cross-referencing.
          </p>

          <div class="hero-stats">
            <div class="hero-stat">
              <span class="hero-stat-value">99.2%</span>
              <span class="hero-stat-label">Accuracy</span>
            </div>
            <div class="hero-stat-divider"></div>
            <div class="hero-stat">
              <span class="hero-stat-value">&lt;10s</span>
              <span class="hero-stat-label">Analysis Time</span>
            </div>
            <div class="hero-stat-divider"></div>
            <div class="hero-stat">
              <span class="hero-stat-value">5+</span>
              <span class="hero-stat-label">Check Points</span>
            </div>
          </div>
        </section>

        <!-- Upload Section -->
        <div id="upload-section">
          <app-image-upload (resultFound)="onResultFound($event)"></app-image-upload>
        </div>

        <!-- Results -->
        <app-result-card *ngIf="medicineResult" [result]="medicineResult"></app-result-card>

        <!-- AI Explanation Panel -->
        <app-ai-explanation
          *ngIf="medicineResult?.ai_explanations?.length"
          [explanations]="medicineResult!.ai_explanations!"
        ></app-ai-explanation>

        <!-- Seller Info -->
        <app-seller-info *ngIf="seller" [seller]="seller"></app-seller-info>

        <!-- How It Works Section -->
        <section class="how-it-works" style="animation: fadeIn 0.8s ease-out both; animation-delay: 0.3s;">
          <h2 class="section-heading">How It Works</h2>
          <div class="steps-grid">
            <div class="step-card">
              <div class="step-number">1</div>
              <div class="step-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </div>
              <h3 class="step-title">Upload Image</h3>
              <p class="step-desc">Take a clear photo of your medicine strip or packaging</p>
            </div>
            <div class="step-card">
              <div class="step-number">2</div>
              <div class="step-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M12 2a4 4 0 0 1 4 4v1a1 1 0 0 0 1 1h1a4 4 0 0 1 0 8h-1a1 1 0 0 0-1 1v1a4 4 0 0 1-8 0v-1a1 1 0 0 0-1-1H6a4 4 0 0 1 0-8h1a1 1 0 0 0 1-1V6a4 4 0 0 1 4-4z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </div>
              <h3 class="step-title">AI Analysis</h3>
              <p class="step-desc">Our AI examines visual markers, text, and packaging quality</p>
            </div>
            <div class="step-card">
              <div class="step-number">3</div>
              <div class="step-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <h3 class="step-title">Get Results</h3>
              <p class="step-desc">Receive detailed authenticity score with flagged issues</p>
            </div>
          </div>
        </section>

        <!-- Footer -->
        <footer class="app-footer" style="animation: fadeIn 1s ease-out both; animation-delay: 0.5s;">
          <div class="footer-inner">
            <div class="footer-brand">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span>MediVerify</span>
            </div>
            <p class="footer-note">Built with <span style="color: var(--accent-red);">♥</span> for healthcare innovation — results are advisory only</p>
            <div class="footer-links">
              <a>Privacy</a>
              <a>Terms</a>
              <a>Contact</a>
            </div>
            <p class="footer-tech">Powered by LLaVA Vision AI • Tesseract OCR • Sharp Quality Gate • Angular • Express.js</p>
            <p class="footer-copyright">© 2026 MediVerify. All rights reserved.</p>
          </div>
        </footer>

      </main>
    </div>

    <div id="google_translate_element" class="translate-anchor" aria-hidden="true"></div>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
    }

    /* ─── Navbar ─── */
    .navbar {
      position: sticky;
      top: 0;
      z-index: 100;
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--border-light);
      padding: 0 1.5rem;
    }

    .navbar-inner {
      max-width: 1100px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 64px;
      gap: 1rem;
    }

    .navbar-brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .brand-icon {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: linear-gradient(135deg, var(--accent-blue), #1D4ED8);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
    }

    .brand-text {
      font-family: var(--font-display);
      font-weight: 800;
      font-size: 1.35rem;
      color: var(--text-primary);
    }

    .navbar-links {
      display: flex;
      gap: 0.25rem;
    }

    .language-switcher {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.3rem;
      border-radius: var(--radius-md);
      border: 1px solid var(--border-light);
      background: rgba(255, 255, 255, 0.7);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }

    .lang-btn {
      border: 0;
      border-radius: 8px;
      padding: 0.35rem 0.6rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary);
      background: transparent;
      cursor: pointer;
      transition: all 0.18s ease;
      white-space: nowrap;
    }

    .lang-btn:hover {
      color: var(--accent-blue);
      background: var(--accent-blue-50);
    }

    .lang-btn.active {
      color: white;
      background: var(--accent-blue);
      box-shadow: 0 1px 5px rgba(37, 99, 235, 0.25);
    }

    .nav-link {
      padding: 0.5rem 1rem;
      border-radius: var(--radius-sm);
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.2s ease;
      text-decoration: none;
    }

    .nav-link:hover, .nav-link.active {
      color: var(--accent-blue);
      background: var(--accent-blue-50);
    }

    .nav-cta {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 0.5rem 1.25rem;
      border-radius: var(--radius-md);
      border: none;
      background: var(--accent-blue);
      color: white;
      font-family: var(--font-body);
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);
    }

    .nav-cta:hover {
      background: #1D4ED8;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35);
      transform: translateY(-1px);
    }

    .translate-anchor {
      position: fixed;
      left: -9999px;
      top: -9999px;
      width: 1px;
      height: 1px;
      overflow: hidden;
      opacity: 0;
      pointer-events: none;
    }

    /* ─── Main Container ─── */
    .app-container {
      position: relative;
      z-index: 1;
      min-height: calc(100vh - 64px);
      padding: 2rem 1.5rem;
    }

    .main-content {
      max-width: 800px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    /* ─── Hero Section ─── */
    .hero-section {
      text-align: center;
      padding: 3rem 1rem 2rem;
    }

    .hero-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 0.4rem 1rem;
      border-radius: 999px;
      background: var(--accent-blue-50);
      border: 1px solid var(--accent-blue-100);
      color: var(--accent-blue);
      font-family: var(--font-display);
      font-size: 0.8rem;
      font-weight: 600;
      margin-bottom: 1.25rem;
    }

    .hero-title {
      font-family: var(--font-display);
      font-size: 3rem;
      font-weight: 900;
      color: var(--text-primary);
      line-height: 1.15;
      letter-spacing: -0.03em;
      margin-bottom: 1rem;
    }

    .hero-gradient {
      background: linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-green) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .hero-subtitle {
      max-width: 520px;
      margin: 0 auto 2rem;
      font-size: 1.05rem;
      color: var(--text-secondary);
      line-height: 1.7;
    }

    .hero-stats {
      display: inline-flex;
      align-items: center;
      gap: 1.5rem;
      padding: 1rem 2rem;
      background: var(--bg-card);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-md);
    }

    .hero-stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }

    .hero-stat-value {
      font-family: var(--font-display);
      font-weight: 800;
      font-size: 1.35rem;
      color: var(--accent-blue);
    }

    .hero-stat-label {
      font-size: 0.72rem;
      font-weight: 500;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .hero-stat-divider {
      width: 1px;
      height: 32px;
      background: var(--border-light);
    }

    /* ─── How It Works ─── */
    .how-it-works {
      padding: 2rem 0 1rem;
    }

    .section-heading {
      font-family: var(--font-display);
      font-size: 1.5rem;
      font-weight: 800;
      color: var(--text-primary);
      text-align: center;
      margin-bottom: 1.5rem;
    }

    .steps-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
    }

    .step-card {
      position: relative;
      background: var(--bg-card);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-lg);
      padding: 1.5rem 1.25rem;
      text-align: center;
      transition: all 0.25s ease;
      box-shadow: var(--shadow-sm);
    }

    .step-card:hover {
      transform: translateY(-4px);
      box-shadow: var(--shadow-lg);
      border-color: var(--accent-blue-100);
    }

    .step-number {
      position: absolute;
      top: -10px;
      left: -10px;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--accent-blue);
      color: white;
      font-family: var(--font-display);
      font-weight: 800;
      font-size: 0.8rem;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 6px rgba(37, 99, 235, 0.3);
    }

    .step-icon {
      width: 56px;
      height: 56px;
      margin: 0 auto 1rem;
      border-radius: var(--radius-md);
      background: var(--accent-blue-50);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent-blue);
    }

    .step-title {
      font-family: var(--font-display);
      font-size: 1rem;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 0.4rem;
    }

    .step-desc {
      font-size: 0.82rem;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    /* ─── Footer ─── */
    .app-footer {
      padding: 2rem 0 1.5rem;
      border-top: 1px solid var(--border-light);
      margin-top: 1rem;
    }

    .footer-inner {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.6rem;
    }

    .footer-brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: var(--font-display);
      font-weight: 700;
      font-size: 1.05rem;
      color: var(--text-primary);
    }

    .footer-brand svg {
      color: var(--accent-blue);
    }

    .footer-note {
      font-size: 0.82rem;
      color: var(--text-secondary);
    }

    .footer-links {
      display: flex;
      gap: 1.5rem;
    }

    .footer-links a {
      font-size: 0.8rem;
      color: var(--text-tertiary);
      text-decoration: none;
      cursor: pointer;
      transition: color 0.2s;
    }

    .footer-links a:hover {
      color: var(--accent-blue);
    }

    .footer-tech {
      font-size: 0.72rem;
      color: var(--text-tertiary);
    }

    .footer-copyright {
      font-size: 0.7rem;
      color: var(--text-tertiary);
      opacity: 0.7;
    }

    /* ─── Responsive ─── */
    @media (max-width: 768px) {
      .navbar-links { display: none; }
      .language-switcher { gap: 0.2rem; padding: 0.25rem; }
      .lang-btn { padding: 0.32rem 0.5rem; font-size: 0.72rem; }

      .hero-title { font-size: 2.25rem; }
      .hero-subtitle { font-size: 0.95rem; }

      .hero-stats {
        flex-direction: column;
        gap: 0.75rem;
        padding: 1rem 1.5rem;
      }
      .hero-stat-divider {
        width: 40px;
        height: 1px;
      }

      .steps-grid { grid-template-columns: 1fr; }

      .app-container { padding: 1.5rem 1rem; }
    }

    @media (max-width: 480px) {
      .hero-title { font-size: 1.85rem; }
      .language-switcher { display: none; }
      .nav-cta span { display: none; }
    }
  `]
})
export class AppComponent implements OnInit {
  medicineResult: MedicineResult | null = null;
  seller: SellerInfo | null = null;
  selectedLanguage: 'en' | 'hi' | 'gu' = 'en';

  private readonly translateScriptId = 'google-translate-script';

  constructor(
    private readonly medicineService: MedicineService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.initGoogleTranslate();
  }

  onResultFound(result: MedicineResult): void {
    this.medicineResult = result;
    this.seller = this.medicineService.getSeller();
    this.cdr.markForCheck();
  }

  scrollToUpload(): void {
    document.getElementById('upload-section')?.scrollIntoView({ behavior: 'smooth' });
  }

  setLanguage(language: 'en' | 'hi' | 'gu'): void {
    this.selectedLanguage = language;
    this.applyLanguage(language, true);
    this.cdr.markForCheck();
  }

  private initGoogleTranslate(): void {
    const win = window as Window & {
      googleTranslateElementInit?: () => void;
      google?: {
        translate?: {
          TranslateElement?: new (
            options: {
              pageLanguage: string;
              includedLanguages: string;
              autoDisplay: boolean;
            },
            elementId: string
          ) => unknown;
        };
      };
    };

    win.googleTranslateElementInit = () => {
      const TranslateElement = win.google?.translate?.TranslateElement;
      if (!TranslateElement) {
        return;
      }

      new TranslateElement(
        {
          pageLanguage: 'en',
          includedLanguages: 'en,hi,gu',
          autoDisplay: false
        },
        'google_translate_element'
      );
    };

    if (document.getElementById(this.translateScriptId)) {
      win.googleTranslateElementInit?.();
      return;
    }

    const script = document.createElement('script');
    script.id = this.translateScriptId;
    script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    script.async = true;
    document.body.appendChild(script);
  }

  private applyLanguage(language: 'en' | 'hi' | 'gu', shouldRetry: boolean): void {
    const combo = document.querySelector('.goog-te-combo') as HTMLSelectElement | null;

    if (combo) {
      combo.value = language;
      combo.dispatchEvent(new Event('change'));
      return;
    }

    this.setGoogleTranslateCookie(language);

    if (shouldRetry) {
      window.setTimeout(() => this.applyLanguage(language, false), 500);
    }
  }

  private setGoogleTranslateCookie(language: 'en' | 'hi' | 'gu'): void {
    const cookieValue = `/en/${language}`;
    const farFuture = 'Fri, 31 Dec 9999 23:59:59 GMT';

    document.cookie = `googtrans=${cookieValue}; expires=${farFuture}; path=/`;
    document.cookie = `googtrans=${cookieValue}; expires=${farFuture}; path=/; domain=${window.location.hostname}`;
  }
}
