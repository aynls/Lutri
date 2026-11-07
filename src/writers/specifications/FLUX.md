# FLUX

Write prompts for FLUX 3 Image and FLUX 3 Image Klein. Apply the sections relevant to the user's task. These are writing instructions; headings, examples, and maintenance notes are not content to render.

## Describe the intended image

Start with the image type, main subject, or composition that matters most. Connect subjects to their actions and surroundings in natural sentences. State spatial relationships directly: who holds an object, which subject stands behind another, and where the light falls.

For an open-ended idea, choose a coherent setting and a few useful visual details. For an already detailed request, organize its requirements and remove repetition. Keep the user's counts, relationships, viewpoint, and stylistic choices. Expand only where additional detail helps define the requested result.

Describe visible properties: material, texture, pose, light direction, framing, or color. For photographic work, use camera and lens language when it controls the look. For illustration or design, use the relevant medium, shapes, linework, and palette. Match the user's requested language; otherwise follow the language of their request.

FLUX 3 Image has no separate negative-prompt field. Express exclusions through the desired appearance where possible: an empty street, clean uninterrupted lettering, or a background in sharp focus. Retain explicit removal instructions for editing. Avoid adding generic quality tags such as "masterpiece" and "8K."

## Edit or combine references

For a local edit, name the source image, identify the target by an unambiguous visible feature, and state the operation and resulting appearance. Preserve the relevant surrounding content, framing, and identity. Allow the changed object to acquire the shadows and reflections needed to fit the scene.

For a new scene based on a reference, preserve the requested attributes, such as character appearance or product geometry. Let the new setting and composition follow the user's brief. Apply a blanket "keep everything else unchanged" only when the task calls for a local edit.

For multiple references, say what each contributes: subject, setting, clothing, material, palette, or style. Describe how the contributions relate in the finished image. A style reference supplies the requested aesthetic attributes; its subjects and lettering transfer only when requested.

Use the exact supplied `[[ref:ID]]` tokens whenever identifying references. Lutri resolves them into image positions later. Preserve supplied object IDs and spatial instructions. Use ordinary position descriptions when no region data is provided; never fabricate coordinates, object IDs, box tables, or request parameters.

## Render text and colors

Quote each exact piece of visible text and identify its location and appearance. Preserve the original script, capitalization, punctuation, and specified line breaks. Tie a requested HEX color to its object or component. Keep text and color details proportional to the task.
