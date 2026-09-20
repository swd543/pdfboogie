//! WASM core for the PDF utilities.
//!
//! One module, two operations, each exposed to the app behind a thin TS
//! wrapper (`src/wasm/pdfcore.ts`):
//!
//! * [`lossless_compress`] – re-saves a PDF through lopdf with object
//!   streams + cross-reference streams. Byte-for-byte safe (no content is
//!   re-encoded), so quality cannot change; size drops for documents with
//!   bloat (uncompressed structure, duplicate objects, big xref tables).
//! * [`probe`] – cheap metadata for the UI: page count and encryption flag.
//!
//! Deliberately kept tiny and dependency-light. See `docs/ARCHITECTURE.md`
//! ("Rust WASM core") for the trade-off notes and the plan for splitting
//! into per-feature artifacts if the surface grows.

use wasm_bindgen::prelude::*;

/// Metadata about a PDF document (camelCase getters for the JS side).
#[wasm_bindgen]
pub struct ProbeInfo {
    #[wasm_bindgen(js_name = pageCount)]
    pub page_count: u32,
    #[wasm_bindgen(js_name = isEncrypted)]
    pub is_encrypted: bool,
    pub size: u32,
}

/// Re-save `input` with structural compression (object streams + xref
/// streams). Returns the new document bytes.
///
/// This is lossless with respect to rendering: all content streams, images
/// and fonts are carried through unchanged.
#[wasm_bindgen]
pub fn lossless_compress(input: Vec<u8>) -> Result<Vec<u8>, JsError> {
    let mut doc = lopdf::Document::load_mem(&input)
        .map_err(|e| JsError::new(&format!("Could not read PDF: {e}")))?;

    // Refuse encrypted documents up front with a friendly error rather than
    // producing a broken output.
    if doc.is_encrypted() {
        return Err(JsError::new("This PDF is password-protected and cannot be compressed."));
    }

    let options = lopdf::SaveOptions::builder()
        .use_object_streams(true)
        .use_xref_streams(true)
        .linearize(false)
        .compression_level(9)
        .build();

    let mut out: Vec<u8> = Vec::new();
    doc.save_with_options(&mut out, options)
        .map_err(|e| JsError::new(&format!("Could not optimize PDF: {e}")))?;

    Ok(out)
}

/// Extract a little metadata for the UI without doing any work.
#[wasm_bindgen]
pub fn probe(input: Vec<u8>) -> Result<ProbeInfo, JsError> {
    let doc = lopdf::Document::load_mem(&input)
        .map_err(|e| JsError::new(&format!("Could not read PDF: {e}")))?;

    Ok(ProbeInfo {
        page_count: doc.get_pages().len() as u32,
        is_encrypted: doc.is_encrypted(),
        size: input.len() as u32,
    })
}
