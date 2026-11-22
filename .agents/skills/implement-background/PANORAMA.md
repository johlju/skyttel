# Spherical panorama prompt

Fill the template in the scenario’s language. Replace every bracket with
concrete visual detail. A reader using only the finished prompt must be able
to place the observer, tell the start view from the reverse view, and explain
how the flat image fits the camera. Keep map controls out of the image.

> Create a [medium and visual style] panorama from [observer’s fixed position
> in the environment], for a [light or dark] map background. Paint the inside
> of a sphere as one equirectangular 2:1 texture covering 360° around the
> observer and 180° from directly above to directly below. At the horizontal
> center, [starting view and unique focal point]. Turning right reveals
> [right view], then [reverse view at the joined edges], then [left view]
> before returning to the start. Directly overhead, [zenith]. Directly below,
> [nadir]. [Light source, shadows, what obscures what, and detail that
> continues around the observer.] Keep each landmark in its own direction.
> Let [recognizable feature] continue across the left and right edges at the
> same height and brightness. The scene must wrap smoothly, preserve shapes
> when looking into either pole, and keep highlights and dark areas readable
> behind map overlays. Deliver the environment alone, free of lettering,
> interface elements and mirrored or repeated focal points.

## Worked example for image generation

**Scenario.** In dark theme, the map is the observer on Earth, inside the
Milky Way. The bright core is ahead. Looking away from it reveals a different
part of the galaxy. Looking out of its plane reveals open sky.

**Prompt.** Create a photorealistic night sky from Earth inside the Milky Way.
Deliver an equirectangular 2:1 texture for the inside of a sphere, covering
360° around the observer and 180° from directly overhead to directly below.
Run the galactic plane along the equator. Place the warm white bulge toward
Sagittarius once, at the horizontal center. On one side, dark branching dust
clouds obscure distant stars. On the other, dense star clouds resolve into
smaller groups. Follow the band around to the faint anticenter crossing the
joined side edges. Keep its width, star positions and light level continuous
across the join. Leave both galactic poles as distinct, sparser star fields
where the band falls entirely outside the camera’s view. Use restrained
highlights and natural star colors. Show sky in every direction, without a
ground horizon, lettering or interface.

Skyttel’s **Vintergatan** uses the photographic panorama by ESO/S. Brunier.
The prompt above illustrates how to generate a new image from a scenario.
