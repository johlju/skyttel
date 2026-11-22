---
name: implement-background
description: Create a panorama background for Skyttel’s spatial map or write its image prompt.
disable-model-invocation: true
---

# Implement a Skyttel panorama

Read the scenario from the request or its background issue. If neither
supplies an environment, ask for one.

For an implementation, follow any test scope the user has already set.
Otherwise, ask whether to leave writing and running unit and integration
tests to the user for later, when they can choose a less expensive model.
When deferred, use the manual camera review below and skip commands that
run either suite.

## Place the observer

- Establish the target theme, visual style, and observer’s fixed position.
  Name the start view and its focal point, what changes a quarter turn to
  either side and half a turn behind, and what lies directly above and below.
  Include ground, a horizon or sky only when the observer could see it.
- Place each unique landmark once. Identify which surfaces catch the light,
  which cast shadows, and which foreground features hide or dim distant
  detail. Describe which features are nearby and which are effectively at
  infinity so camera movement can respect their depth.
- Ask for details that would change the observer’s position or the identity
  of a requested landmark. Fill minor gaps consistently and identify any
  artistic assumptions outside the prompt.

## Produce the requested result

Fill the [panorama template](PANORAMA.md) for every scenario. It specifies
the projection, seam and poles and includes a worked example.

- For a prompt request, return one standalone, paste-ready prompt in the
  scenario’s language, followed by the checks to perform once an image exists.
- For an implementation, generate or render the scene as a 2:1
  equirectangular texture covering 360° horizontally and 180° vertically.
  Check that its width is twice its height before mapping it to the inside
  of the sphere. Credit any source imagery or data used in the asset.
  Connect the panorama to the existing themed background choice. Preserve a
  saved choice’s identifier when improving its appearance. For visibility,
  personal settings, camera response and reduced motion, follow
  [Ordna din personliga vy](../../../docs/user-guide/spatial-map.md#ordna-din-personliga-vy).

## Review through the map camera

The flat texture contains every direction. The camera shows one perspective
view from inside the scene. Inspect the normal map on mobile and desktop.

1. Rotate about a selected object away from the map center. Compare the
   start, quarter-turn and half-turn views, then look directly up and down.
   Match each view to its scenario landmark. Follow a feature through the
   joined edges. After a full turn, the start landmark must return to its
   original direction without a jump, duplication or visible line.
2. Pan and zoom. Check near and distant features against their intended
   depth. A distant sky stays fixed in direction when the map is panned.
   Hold the camera still and watch for drift. With reduced motion enabled,
   the background must hold its view while the map moves. Disable reduced
   motion and confirm that only new camera movements affect the background.
3. Read object labels and trace a relationship, including its arrowhead,
   across the brightest and darkest patches at both screen sizes. Check
   object symbols remain distinct. For a selectable background, toggle its
   visibility, switch themes and reload the map to confirm the personal choice.

Report the directions and device sizes actually inspected, visible defects,
and any checks that still need the generated asset or a running map.
If tests were deferred, remind the user to implement the unit and integration
tests they consider necessary.
