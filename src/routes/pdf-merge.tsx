/**
 * Merge tool page: multiple PDFs and images → one PDF.
 *
 * State machine: empty → ready (files listed) → processing → done.
 * Heavy lifting lives in `./logic` (unit-tested, lazy-loaded deps).
 */

import { Meta, Title } from '@solidjs/meta';
import { createSignal, For, Show } from 'solid-js';
import { AdSlot } from '~/components/AdSlot';
import {
  AlertIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  DownloadIcon,
  SpinnerIcon,
  TrashIcon,
} from '~/components/Icons';
import { DropZone, ProgressBar, ToolColumns, ToolPage } from '~/components/Shell';
import type { PageSize } from '~/features/image-to-pdf/logic';
import { type MergeInput, mergeFiles } from '~/features/pdf-merge/logic';
import { saveBlob } from '~/lib/download';
import { cleanFileName, humanSize, nextId, readFileBytes } from '~/lib/files';
import { type FileItem, isImageFile, isPdfFile, yieldToBrowser } from '~/lib/types';
import { expandAds } from '~/site/ads';
import { siteUrl } from '~/site/config';
import { jsonLdFor, routeMeta } from '~/site/seo';

interface Item extends FileItem {
  kind: 'pdf' | 'image';
  /** PDF bytes (read up front so the logic module can copy pages). */
  pdfBytes?: Uint8Array;
}

type Phase = 'empty' | 'ready' | 'processing' | 'done';

const MAX_FILES = 30;

export default function MergePage() {
  const meta = routeMeta['/pdf-merge']!;

  const [items, setItems] = createSignal<Item[]>([]);
  const [phase, setPhase] = createSignal<Phase>('empty');
  const [error, setError] = createSignal('');
  const [progress, setProgress] = createSignal({ done: 0, total: 1, label: '' });
  const [result, setResult] = createSignal<{ bytes: Uint8Array; name: string } | null>(null);

  const [pageSize, setPageSize] = createSignal<PageSize>('fit');
  const [margin, setMargin] = createSignal(0);

  const baseName = () => {
    const first = items()[0];
    if (items().length === 1 && first) return first.name.replace(/\.[^.]+$/, '') || 'merged';
    return 'merged';
  };

  const totalInputSize = () => items().reduce((sum, i) => sum + i.size, 0);

  const addFiles = async (files: File[]) => {
    const errors: string[] = [];
    const rejected: string[] = [];
    const accepted: File[] = [];

    for (const file of files) {
      if (isPdfFile(file) || isImageFile(file)) accepted.push(file);
      else rejected.push(cleanFileName(file.name));
    }
    const truncated = accepted.length > MAX_FILES - items().length;
    const toAdd = accepted.slice(0, MAX_FILES - items().length);

    if (rejected.length > 0) {
      errors.push(
        `Not PDF or images: ${rejected.slice(0, 3).join(', ')}${rejected.length > 3 ? '…' : ''}`,
      );
    }
    if (truncated) errors.push(`Limit is ${MAX_FILES} files — extras were skipped.`);
    setError(errors.join(' '));

    for (const file of toAdd) {
      await yieldToBrowser();
      const kind = isPdfFile(file) ? 'pdf' : 'image';
      let pdfBytes: Uint8Array | undefined;
      if (kind === 'pdf') {
        try {
          pdfBytes = new Uint8Array(await readFileBytes(file));
        } catch {
          errors.push(`Couldn't read ${cleanFileName(file.name)}.`);
          continue;
        }
      }
      setItems([
        ...items(),
        {
          id: nextId('file'),
          name: cleanFileName(file.name),
          size: file.size,
          type: file.type,
          file,
          kind,
          pdfBytes,
        },
      ]);
    }
    if (errors.length > 0) setError(errors.join(' '));
    if (toAdd.length > 0) {
      setResult(null);
      setPhase('ready');
    }
  };

  const move = (id: string, dir: -1 | 1) => {
    const list = [...items()];
    const from = list.findIndex((x) => x.id === id);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= list.length) return;
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item!);
    setItems(list);
  };

  const remove = (id: string) => {
    const list = items().filter((x) => x.id !== id);
    setItems(list);
    if (list.length === 0) {
      setPhase('empty');
      setResult(null);
    }
  };

  const process = async () => {
    const list = items();
    if (list.length === 0 || phase() !== 'ready') return;
    expandAds();
    setPhase('processing');
    setError('');
    setResult(null);
    setProgress({ done: 0, total: list.length, label: 'Starting…' });
    try {
      const inputs: MergeInput[] = list.map((i) =>
        i.kind === 'pdf'
          ? { kind: 'pdf', name: i.name, bytes: i.pdfBytes! }
          : { kind: 'image', name: i.name, file: i.file },
      );
      const bytes = await mergeFiles(
        inputs,
        { pageSize: pageSize(), marginPt: margin() },
        (done, total, label) => setProgress({ done, total, label: label ?? '' }),
      );
      setResult({ bytes, name: `${baseName()}.pdf` });
      setPhase('done');
      saveBlob(bytes, `${baseName()}.pdf`, 'application/pdf'); // auto-download, like the other tools
    } catch (err) {
      setPhase('ready');
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  const download = () => {
    const r = result();
    if (r) saveBlob(r.bytes, r.name, 'application/pdf');
  };

  const startOver = () => {
    setPhase('empty');
    setResult(null);
  };

  return (
    <>
      <Title>{meta.title}</Title>
      <Meta name="description" content={meta.description} />
      <Meta property="og:title" content={meta.title} />
      <Meta property="og:description" content={meta.description} />
      <Meta property="og:url" content={`${siteUrl}/pdf-merge`} />
      {meta.image && <Meta property="og:image" content={meta.image} />}
      <script type="application/ld+json" innerHTML={JSON.stringify(jsonLdFor('/pdf-merge'))} />

      <ToolPage
        title="Merge PDF"
        lede="Combine several PDFs — and JPG, PNG, WebP images — into a single PDF. Arrange the order, pick image page sizes, download. Nothing is uploaded."
        related={[
          { path: '/pdf-combine', label: 'Combine pages' },
          { path: '/image-to-pdf', label: 'Image to PDF' },
          { path: '/pdf-compress', label: 'Compress PDF' },
        ]}
      >
        <ToolColumns
          aside={
            <>
              <div class="panel">
                <div class="panel-body">
                  <p style="font-size: 0.95rem; margin: 0 0 0.75rem; font-weight: 600">
                    Image pages
                  </p>
                  <div class="opt-group">
                    <label for="mergePageSize">Page size</label>
                    <select
                      id="mergePageSize"
                      value={pageSize()}
                      onChange={(e) => setPageSize(e.currentTarget.value as PageSize)}
                    >
                      <option value="fit">Fit to image</option>
                      <option value="a4">A4</option>
                      <option value="letter">Letter</option>
                      <option value="legal">Legal</option>
                    </select>
                    <p class="opt-hint">Applies to images; PDF pages keep their own size.</p>
                  </div>
                  <div class="opt-group">
                    <label for="mergeMargin">Margins</label>
                    <select
                      id="mergeMargin"
                      value={margin()}
                      onChange={(e) => setMargin(Number(e.currentTarget.value))}
                    >
                      <option value={0}>None</option>
                      <option value={8}>Slim</option>
                      <option value={24}>Comfortable</option>
                    </select>
                  </div>
                </div>
              </div>
              <div class="panel">
                <div class="panel-body">
                  <h3>Order matters</h3>
                  <p style="font-size: 0.88rem; color: var(--ink-muted); margin: 0">
                    Files are merged in the list order below — move them up or down before merging.
                    Password-protected PDFs can't be merged.
                  </p>
                </div>
              </div>
              <AdSlot slot="tool-bottom" className="aside-ad" />
            </>
          }
        >
          <div class="panel">
            <div class="panel-body">
              <DropZone
                accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif"
                multiple
                title="Drop PDFs and images here"
                subtitle="PDF, JPG, PNG, WebP, GIF, BMP, AVIF — mix and match"
                busy={phase() === 'processing'}
                onFiles={addFiles}
              />
              <Show when={items().length > 0}>
                <ul class="filelist" aria-label="Files to merge">
                  <For each={items()}>
                    {(item) => (
                      <li class="file-row">
                        <span class="file-thumb" />
                        <span class="file-name" title={item.name}>
                          {item.name}
                        </span>
                        <span class="file-size">
                          {humanSize(item.size)}
                          {item.kind === 'image' ? ' · image' : ''}
                        </span>
                        <span class="file-actions">
                          <button
                            type="button"
                            class="btn btn-sm btn-icon btn-ghost"
                            aria-label={`Move ${item.name} up`}
                            onClick={() => move(item.id, -1)}
                            disabled={phase() !== 'ready'}
                          >
                            <ArrowUpIcon />
                          </button>
                          <button
                            type="button"
                            class="btn btn-sm btn-icon btn-ghost"
                            aria-label={`Move ${item.name} down`}
                            onClick={() => move(item.id, 1)}
                            disabled={phase() !== 'ready'}
                          >
                            <ArrowDownIcon />
                          </button>
                          <button
                            type="button"
                            class="btn btn-sm btn-icon btn-ghost"
                            aria-label={`Remove ${item.name}`}
                            onClick={() => remove(item.id)}
                            disabled={phase() !== 'ready'}
                          >
                            <TrashIcon />
                          </button>
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
              <Show when={error()}>
                <div class="error-card" role="alert">
                  <AlertIcon />
                  <span>{error()}</span>
                </div>
              </Show>
            </div>
          </div>

          <Show when={items().length > 1 && phase() !== 'processing' && phase() !== 'done'}>
            <div class="panel cta">
              <div class="panel-body">
                <button
                  type="button"
                  class="btn btn-primary btn-block"
                  onClick={process}
                  disabled={items().length < 2}
                >
                  <SpinnerIcon />
                  Merge {items().length} {items().length === 1 ? 'file' : 'files'} into one PDF
                </button>
              </div>
            </div>
          </Show>

          <Show when={phase() === 'processing'}>
            <div class="panel">
              <ProgressBar
                done={progress().done}
                total={progress().total}
                label={progress().label}
              />
            </div>
            <AdSlot slot="processing" className="processing-ad" />
          </Show>

          <Show when={phase() === 'done' && result()}>
            <div class="panel">
              <div class="result-card">
                <div class="result-size">
                  <span class="was">{humanSize(totalInputSize())} of input</span>
                  <span class="now">{humanSize(result()!.bytes.byteLength)}</span>
                  <span class="delta neutral">PDF · {items().length} files merged</span>
                </div>
                <div class="result-actions">
                  <button type="button" class="btn btn-primary" onClick={download}>
                    <DownloadIcon />
                    Download PDF
                  </button>
                  <button type="button" class="btn btn-ghost" onClick={startOver}>
                    Start over
                  </button>
                </div>
              </div>
            </div>
          </Show>
        </ToolColumns>
      </ToolPage>
    </>
  );
}
