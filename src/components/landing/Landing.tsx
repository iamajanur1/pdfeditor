import React, { useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowRight, Check, ChevronDown, ClipboardEdit, FileArchive,
  FileImage, FilePlus, FileSignature, FileText, Files, Images, Layers, LockKeyhole,
  Menu, Moon, RotateCw, Scissors, ShieldCheck, Sun, UploadCloud, X, FileCode2, FileJson, FileType2, BookOpen,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { UtilityAction } from '@/App';

const categories = [
  { value: 'edit', name: 'Edit & sign' },
  { value: 'organize', name: 'Organize PDF' },
  { value: 'from', name: 'Convert from PDF' },
  { value: 'to', name: 'Convert to PDF' },
] as const;

const tools: Record<(typeof categories)[number]['value'], { name: string; description: string; action: UtilityAction; icon: LucideIcon }[]> = {
  edit: [
    { name: 'Edit PDF', description: 'Edit text and add content', action: 'edit', icon: ClipboardEdit },
    { name: 'Sign PDF', description: 'Draw and place signatures', action: 'sign', icon: FileSignature },
    { name: 'Annotate PDF', description: 'Highlight, draw and mark up', action: 'annotate', icon: FileText },
    { name: 'Fill PDF forms', description: 'Work with supported PDF fields', action: 'forms', icon: Layers },
  ],
  organize: [
    { name: 'Merge PDF', description: 'Combine multiple documents', action: 'merge', icon: Files },
    { name: 'Split / extract', description: 'Save chosen pages', action: 'split', icon: Scissors },
    { name: 'Organize pages', description: 'Reorder, rotate, add and delete', action: 'organize', icon: FileArchive },
    { name: 'Rotate PDF', description: 'Change page orientation', action: 'rotate', icon: RotateCw },
  ],
  from: [
    { name: 'PDF to PNG', description: 'Download page images', action: 'pdf-to-png', icon: Images },
    { name: 'PDF to JPG', description: 'Export as image files', action: 'pdf-to-jpg', icon: FileImage },
    { name: 'PDF to text', description: 'Extract selectable text', action: 'pdf-to-text', icon: ArrowDownToLine },
    { name: 'PDF to Word', description: 'Editable DOCX — text only', action: 'pdf-to-docx', icon: FileType2 },
    { name: 'PDF to WebP', description: 'Smaller web-friendly page images', action: 'pdf-to-webp', icon: FileImage },
    { name: 'PDF to HTML', description: 'Readable text-based HTML', action: 'pdf-to-html', icon: FileCode2 },
    { name: 'PDF to JSON', description: 'Structured page text', action: 'pdf-to-json', icon: FileJson },
    { name: 'PDF to EPUB', description: 'Reflowable text-based ebook', action: 'pdf-to-epub', icon: BookOpen },
    { name: 'PDF to Markdown', description: 'Page-organized editable text', action: 'pdf-to-markdown', icon: FileText },
  ],
  to: [
    { name: 'JPG to PDF', description: 'Create PDF from photos', action: 'images-to-pdf', icon: FilePlus },
    { name: 'PNG to PDF', description: 'Combine PNG images', action: 'images-to-pdf', icon: Images },
    { name: 'WebP to PDF', description: 'Convert WebP images', action: 'images-to-pdf', icon: FileImage },
    { name: 'BMP to PDF', description: 'Convert bitmap images', action: 'images-to-pdf', icon: Images },
    { name: 'TXT to PDF', description: 'Create a PDF from plain text', action: 'text-to-pdf', icon: FileType2 },
  ],
};

interface LandingProps {
  isDark: boolean;
  onToggleTheme(): void;
  onOpenFile(file: File, action?: UtilityAction): void;
  onTool(action: UtilityAction): void;
  onImages(files: File[]): void;
}

export function Brand({ isDark, small = false }: { isDark: boolean; small?: boolean }) {
  return (
    <span className={`brand-wrapper ${small ? 'brand-small' : ''}`} aria-label="Paprify">
      <img src={isDark ? '/branding/paprify-horizontal-dark.png' : '/branding/paprify-horizontal-no-tagline.png'} alt="Paprify" />
    </span>
  );
}

export function Landing({ isDark, onToggleTheme, onOpenFile, onTool, onImages }: LandingProps) {
  const [dragging, setDragging] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const process = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onOpenFile(file);
  };

  return (
    <div className="landing-shell">
      <header className="site-header">
        <div className="site-header-inner">
          <a href="/" className="brand-link" aria-label="Paprify home"><Brand isDark={isDark} /></a>
          <nav className={`site-nav ${mobileNav ? 'site-nav-open' : ''}`} aria-label="Main navigation">
            <a href="#tools" onClick={() => setMobileNav(false)}>All tools</a>
            <a href="#how-it-works" onClick={() => setMobileNav(false)}>How it works</a>
            <a href="#privacy" onClick={() => setMobileNav(false)}>Privacy</a>
          </nav>
          <div className="header-actions">
            <Button size="icon" variant="ghost" aria-label={isDark ? 'Use light theme' : 'Use dark theme'} onClick={onToggleTheme}>
              {isDark ? <Sun size={19} /> : <Moon size={19} />}
            </Button>
            <Button className="header-start" size="sm" onClick={() => fileRef.current?.click()}>Open PDF <ArrowRight size={15} /></Button>
            <Button className="mobile-menu" size="icon" variant="ghost" aria-label="Toggle navigation" onClick={() => setMobileNav(!mobileNav)}>
              {mobileNav ? <X size={20} /> : <Menu size={20} />}
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="hero-section" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="hero-kicker">Your document workspace</p>
            <h1 id="hero-title">Everything you need to work with PDFs.</h1>
            <p className="hero-description">Edit supported text, annotate, sign and organize documents in one clear, simple workspace.</p>
          </div>
          <input
            ref={fileRef}
            className="sr-only"
            type="file"
            accept=".pdf,application/pdf"
            onChange={event => { process(event.currentTarget.files); event.currentTarget.value = ''; }}
            aria-label="Choose PDF file"
          />
          <div
            role="button"
            tabIndex={0}
            className={`hero-dropzone ${dragging ? 'hero-dropzone-active' : ''}`}
            onClick={() => fileRef.current?.click()}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileRef.current?.click(); } }}
            onDragEnter={event => { event.preventDefault(); setDragging(true); }}
            onDragOver={event => { event.preventDefault(); setDragging(true); }}
            onDragLeave={event => { event.preventDefault(); setDragging(false); }}
            onDrop={event => { event.preventDefault(); setDragging(false); process(event.dataTransfer.files); }}
          >
            <div className="upload-symbol"><UploadCloud size={30} strokeWidth={1.7} /></div>
            <h2>Drop your PDF here</h2>
            <p>Or select a file to get started</p>
            <span className="upload-button">Choose PDF file <ArrowRight size={17} /></span>
            <small>PDF files up to 100 MB · best on modern devices</small>
          </div>
          <div className="hero-assurances"><span><ShieldCheck size={16} /> Files stay on your device</span><span><Check size={16} /> No account needed</span><span><Check size={16} /> Free to get started</span></div>
        </section>

        <section id="tools" className="tools-section" aria-labelledby="tools-title">
          <div className="section-heading"><div><p className="eyebrow">TOOLS</p><h2 id="tools-title">Choose what you want to do</h2></div><p>Practical tools without unnecessary steps.</p></div>
          <Tabs defaultValue="edit" className="tool-tabs">
            <TabsList className="tool-tabs-list">
              {categories.map(category => <TabsTrigger key={category.value} value={category.value}>{category.name}</TabsTrigger>)}
            </TabsList>
            {categories.map(category => (
              <TabsContent key={category.value} value={category.value}>
                <div className="tool-grid">
                  {tools[category.value].map(({ action, name, description, icon: Icon }) => (
                    <button className="tool-card" type="button" key={name} onClick={() => onTool(action)}>
                      <span className="tool-card-icon"><Icon size={22} strokeWidth={1.8} /></span>
                      <strong>{name}</strong><span>{description}</span>
                      <ArrowRight size={16} className="tool-card-arrow" />
                    </button>
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </section>

        <section id="how-it-works" className="how-section">
          <div className="section-heading"><div><p className="eyebrow">HOW IT WORKS</p><h2>Three steps, one workspace.</h2></div></div>
          <div className="how-grid">
            <div><span className="step-number">01</span><h3>Open your PDF</h3><p>Upload a file directly from your computer, tablet or phone.</p></div>
            <div><span className="step-number">02</span><h3>Make your changes</h3><p>Choose a tool and edit content directly on the document.</p></div>
            <div><span className="step-number">03</span><h3>Download</h3><p>Export the updated PDF when you're finished.</p></div>
          </div>
        </section>

        <section id="privacy" className="privacy-section">
          <LockKeyhole size={26} strokeWidth={1.5} />
          <h2>Private by design.</h2>
          <p>Paprify processes files in your browser. No account or cloud document storage is required. Edited original-text pages are reconstructed when exported, which converts their unedited content to images. This is not a secure redaction tool. Reusable signatures remain in this browser until deleted.</p>
        </section>
      </main>
      <footer className="site-footer"><Brand isDark={isDark} small /><span>PDFs, your way.</span><p>© {new Date().getFullYear()} Paprify · Browser-based PDF tools</p></footer>
    </div>
  );
}
