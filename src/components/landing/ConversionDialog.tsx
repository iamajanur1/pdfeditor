import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowRight, FilePlus2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { conversionStatus, convertRemotely } from '@/lib/remoteConversion';
import type { ImagePdfOptions } from '@/lib/pdf';
import { readableError } from '@/lib/utils';

export function ConversionLandingDialog({
  kind, onClose, onComplete,
}: {
  kind: 'images' | 'office' | null;
  onClose(): void;
  onComplete(bytes: Uint8Array, name: string): Promise<void>;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [pageSize, setPageSize] = useState<ImagePdfOptions['pageSize']>('a4');
  const [layout, setLayout] = useState<ImagePdfOptions['layout']>('contain');
  const [orientation, setOrientation] = useState<ImagePdfOptions['orientation']>('auto');
  const [margin, setMargin] = useState(18);
  const [confirmed, setConfirmed] = useState(false);
  const [serverOnline, setServerOnline] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setFiles([]); setError(''); setConfirmed(false);
    if (kind !== 'office') return;
    let mounted = true;
    void conversionStatus().then(status => { if (mounted) setServerOnline(!!status?.features?.office_to_pdf); });
    return () => { mounted = false; };
  }, [kind]);
  const moveFile = (index: number, offset: number) => setFiles(previous => {
    const copy = [...previous], target = index + offset;
    if (target < 0 || target >= copy.length) return previous;
    [copy[index], copy[target]] = [copy[target], copy[index]];
    return copy;
  });
  const convert = async () => {
    if (!files.length || !kind || working) return;
    setError(''); setWorking(true);
    try {
      if (kind === 'images') {
        const { imagesToPdf } = await import('@/lib/pdf');
        const bytes = await imagesToPdf(files, { pageSize, layout, orientation, margin });
        await onComplete(bytes, files.length === 1 ? files[0].name.replace(/\.[^.]+$/, '') + '.pdf' : 'Combined-images.pdf');
      } else {
        if (!confirmed) throw new Error('Confirm uploading this document to the configured conversion server.');
        const response = await convertRemotely(files[0], 'pdf');
        await onComplete(new Uint8Array(await response.arrayBuffer()), files[0].name.replace(/\.[^.]+$/, '') + '.pdf');
      }
      onClose();
    } catch (caught) { setError(readableError(caught)); }
    finally { setWorking(false); }
  };
  return <Dialog open={kind !== null} onOpenChange={value => { if (!value && !working) onClose(); }}>
    <DialogContent className="conversion-dialog">
      <DialogTitle>{kind === 'office' ? 'Office to PDF' : 'Images to PDF'}</DialogTitle>
      <DialogDescription>{kind === 'office' ? 'Convert Word, PowerPoint and spreadsheet files using a configured LibreOffice service.' : 'Combine images into professionally sized PDF pages in your chosen order.'}</DialogDescription>
      <div className="dialog-form">
        <label>Choose {kind === 'office' ? 'a document' : 'images'}
          <input type="file" multiple={kind === 'images'} accept={kind === 'office' ? '.doc,.docx,.odt,.rtf,.xls,.xlsx,.ods,.ppt,.pptx,.odp' : 'image/jpeg,image/png,image/webp,image/bmp,.bmp'} onChange={event => {
            const incoming = Array.from(event.currentTarget.files || []);
            setFiles(kind === 'office' ? incoming.slice(0, 1) : incoming);
          }} />
        </label>
        {kind === 'images' && <>
          <div className="conversion-fields">
            <label>Page size<select value={pageSize} onChange={event => setPageSize(event.target.value as ImagePdfOptions['pageSize'])}><option value="a4">A4</option><option value="letter">US Letter</option><option value="original">Match image dimensions</option></select></label>
            <label>Orientation<select value={orientation} onChange={event => setOrientation(event.target.value as ImagePdfOptions['orientation'])}><option value="auto">Auto</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
            <label>Image layout<select value={layout} onChange={event => setLayout(event.target.value as ImagePdfOptions['layout'])}><option value="contain">Fit — show entire image</option><option value="cover">Fill — crop overflow</option></select></label>
            <label>Margins<select value={margin} onChange={event => setMargin(Number(event.target.value))}><option value={0}>None</option><option value={18}>Small · ¼ inch</option><option value={36}>Medium · ½ inch</option><option value={54}>Large · ¾ inch</option></select></label>
          </div>
          {files.length > 0 && <div className="image-file-list" aria-label="Image order">{files.map((file, index) => <div key={`${file.name}-${index}`}><span>{index + 1}. {file.name}</span><button type="button" aria-label={`Move ${file.name} up`} disabled={index === 0} onClick={() => moveFile(index, -1)}><ArrowUp size={15} /></button><button type="button" aria-label={`Move ${file.name} down`} disabled={index === files.length - 1} onClick={() => moveFile(index, 1)}><ArrowDown size={15} /></button></div>)}</div>}
        </>}
        {kind === 'office' && <>
          <p className="operation-note">{serverOnline ? 'Conversion service is available. Rendering may vary with fonts and Office features.' : 'The optional conversion service is not connected. Deploy and configure it before using Office conversion.'}</p>
          <label className="conversion-consent"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> I agree to upload this file to the configured conversion server for processing.</label>
        </>}
        {error && <p role="alert" className="conversion-error">{error}</p>}
      </div>
      <div className="dialog-footer"><Button variant="outline" disabled={working} onClick={onClose}>Cancel</Button><Button onClick={convert} disabled={!files.length || working || (kind === 'office' && (!confirmed || !serverOnline))}><FilePlus2 size={16} /> {working ? 'Converting…' : 'Create PDF'} <ArrowRight size={14} /></Button></div>
    </DialogContent>
  </Dialog>;
}
