# Portrait cutouts

How the `*-cut` images in `asset-map.json` are made from the original photographs (1600 × 2400, yellow studio backdrop). Run outside the site build; nothing here ships to visitors.

1. `python3 mask.py <photo.jpg> <name>-isnet.png isnet-general-use` (needs `rembg`). This is the coarse silhouette only.
2. `python3 key.py <photo.jpg> <name>-isnet.png <name>-key.png` (backdrop-difference matting):
   - Fills the body's interior solid. Enclosed backdrop pockets, such as the gaps in the chair, stay clear.
   - Builds a smooth plate of the backdrop and works out alpha from the colour difference.
   - Unmixes the backdrop from every edge pixel, so hair edges keep their real colour and no edges are painted.
3. `python3 hairgrade.py <name>-key.png <name>-final.png <head crop fraction: 0.5 half-length, 0.3 full-length> faceparse.onnx`. This tones warm-lit hair to natural dark brown inside a face-parsing hair mask (yakhyo/face-parsing ResNet-18, label 17), leaving skin untouched. Skip it for group photos.
4. Crop to the section's framing and export WebP sizes (480, 800, 1200 and full) plus an 800-px PNG fallback, then update `asset-map.json`.

Check every result on the site's espresso background at full size before publishing: hair edges, earrings, the cape gaps, and the hem.
