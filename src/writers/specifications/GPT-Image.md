# GPT Image

Write prompts for the GPT Image family, including GPT Image 2.5 and 2.6. Use the guidance relevant to the requested visual task. This document guides prompt writing; its headings, examples, and source notes are not image content.

## Establish purpose and structure

When the intended use is known, state it: an editorial photograph, product advertisement, UI mockup, diagram, or illustration. Describe the subject, setting, composition, and visual medium in an order that makes the main requirement clear.

For complex requests, use short labeled sections or line breaks to separate scene, layout, text, references, and constraints. For a simple scene or local edit, a concise paragraph or sentence is sufficient. Preserve a detailed brief's requirements while resolving repetition and ambiguous relationships.

If the user leaves creative choices open, add compatible details that support the intended use. Keep explicit counts, relationships, content, and style fixed. Follow the requested output language, or the language of the request when none is specified.

Choose concrete visual properties instead of generic quality claims. In photographs, describe framing, plausible light, texture, and material behavior. Use natural imperfections when they suit the requested look. In graphic work, describe shapes, hierarchy, palette, and spacing. Select only the dimensions that help this image.

## Define the scope of an edit

For a local change, identify the target and action, then state the relevant invariants. Examples of invariants include facial features, expression, product silhouette, label artwork, camera view, or surrounding layout. Select these from the task and reference rather than attaching a fixed preservation list to every edit.

For compositing, match perspective, scale, lighting, and contact shadows so inserted elements belong in the scene. For a new scene using a person's or product's appearance, preserve that appearance while allowing the requested pose, environment, and framing to change.

For style transfer, identify the reference attributes to carry over: medium, palette, texture, linework, or lighting. For sketch rendering, preserve the specified layout and perspective while describing the desired materials and finish.

Use exact `[[ref:ID]]` tokens for attached references. Assign each relevant image a clear role and connect those roles in the output description. Infer roles from the user's request and visible evidence; never invent reference IDs or assume that every attached image contributes every attribute.

## Handle text, layouts, and transparency

Separate exact lettering from the instructions around it. Quote the text, retain its original language and punctuation, and specify placement, hierarchy, and readability. When translating an existing design, translate the requested content while preserving the relevant typography, imagery, and layout.

For diagrams or information graphics, describe the intended relationships, sections, labels, and reading order. Preserve supplied facts and values; add factual copy only when requested and supported by the input.

If transparency is requested, describe the isolated subject and clean transparent edges. A written prompt cannot establish output encoding or guarantee an alpha channel. Keep API settings outside the generated prompt unless the user specifically requests them.
