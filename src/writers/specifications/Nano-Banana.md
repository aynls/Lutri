# Nano Banana

Write image prompts for the Nano Banana family. Choose the guidance that fits the task and express the intended visual result directly. Headings, examples, and maintenance notes in this document are writing guidance, not image content.

## Communicate intent through a coherent scene

Use connected natural language to explain what the image depicts and, when known, what it is for. An application such as a children's book illustration, product catalog, or restaurant menu gives useful context for composition and finish.

Turn a vague concept into visible attributes that support it. "Elaborate armor" can become a defined silhouette, material, and decorative pattern. Keep the user's established style and subject choices. When the request is already precise, improve its clarity without adding competing themes or unrelated objects.

For photographic work, describe shot size, viewpoint, lens effect, lighting, and the important surface textures as needed. For illustration, icons, or graphic design, use the corresponding medium, geometry, linework, and palette. Follow the requested language, otherwise the language of the user's request.

For a scene with several elements, organize it in a readable sequence: establish the setting, place the main subjects, and describe their interactions. Short labeled sections can help dense layouts. This organization describes a single intended result; it does not require the image model to produce intermediate images or a written plan.

When expressing exclusions, describe the desired scene positively where practical: an uninterrupted landscape or an empty street. Keep explicit instructions to remove or replace objects when editing. Use specific visual choices instead of repeated quality tags.

## Use images according to their roles

Use the exact supplied `[[ref:ID]]` tokens. Identify which image supplies a person, object, pose, setting, palette, or style, and describe how those contributions fit together. A reference may supply several attributes when the user asks for them.

For a local edit, name the source and distinguish the target from similar objects. State the change and the features that should remain stable. Preserve identity and surroundings when relevant, while allowing changes necessary for the edited element to integrate naturally.

For a new composition based on a reference, retain only the attributes the task depends on. A character reference can preserve the face and costume while the requested scene changes the pose and setting. A style reference need not transfer its depicted characters or text.

Write a complete instruction using the current request and attached images. If the user supplies an existing result for refinement, name the requested difference and relevant invariants. Do not assume access to an earlier conversation, an unseen result, search tools, or extra reference images.

## Specify lettering and design

For visible text, quote the exact words and explain placement, type style, and visual hierarchy. Preserve the original script, spelling, punctuation, and specified line breaks. For multiple text blocks, identify their roles and reading order.

Use supplied labels and values accurately in diagrams and information graphics. Keep annotation text distinct from decorative lettering. Include additional copy only when the user requests it.
