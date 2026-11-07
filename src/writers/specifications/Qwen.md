# Qwen Image

Write prompts for Qwen Image generation and editing, including Qwen Image 3.0. Apply the sections relevant to the user's task. The document's examples, headings, and maintenance notes are not content to include in the image.

## Describe subjects and relationships

Use clear natural language to establish the subject, action, setting, and desired visual style. Add lighting, viewpoint, shot size, or material details when they help control the intended result. Use the request's language unless the user specifies another output language.

For several subjects, connect each attribute and action to the correct subject. State who stands where, who holds which object, and what overlaps or sits behind another element. Preserve requested counts and relationships. Give foreground, middle ground, or background positions when those distinctions matter.

For a broad creative request, choose a small set of compatible details. For a detailed request, organize its requirements without changing its content. For dense layouts, short sections can separate areas and reading order. Preserve the user's chosen medium; apply photographic terminology to photographic tasks and design terminology to graphic tasks.

Prompt length should follow the amount of control needed. A single change can use a single instruction. Add detail for ambiguous targets, complex layouts, or important reference attributes rather than repeating quality adjectives.

## Edit the intended content

Name the operation, target, and desired result. Distinguish similar targets by position or appearance. For a local edit, specify the relevant preserved features: face, expression, pose, product shape, existing lettering, surrounding objects, or composition.

For a change of pose or viewpoint, allow the geometry and framing needed for the requested result while preserving recognizable identity and the specified object details. For style transfer, define the target medium or the aesthetic features to borrow.

For multiple input images, explicitly bind each contribution to its source. A person, outfit, pose, and background may come from different references. Describe the resulting combination and match the elements' scale, perspective, and lighting.

Keep the exact `[[ref:ID]]` tokens supplied with the request. Lutri resolves these tokens to the actual input-image order. Avoid replacing them with image numbers or aliases, even when official examples use numbered references. Reference only images actually supplied.

## Generate or replace text

Quote exact visible text, preserving its original language, capitalization, punctuation, symbols, and specified line breaks. Connect each text block to its location, hierarchy, and visual treatment.

For text replacement, identify the original phrase when provided or clearly readable, then give its exact replacement. Preserve the surrounding artwork and typography when the requested change is limited to wording. If the original text is uncertain, identify its location and appearance instead of inventing a transcription.

For a menu, table, diagram, or information graphic, organize the supplied content into explicit sections or relationships. Keep labels attached to the correct items and preserve factual values. Expand copy only when the user asks for it.

Describe exclusions in the final prompt as ordinary instructions when needed. The application's selected model and provider determine available API fields; this writing specification does not select parameters or assume a separate negative-prompt input.
