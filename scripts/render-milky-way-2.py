"""Bake the dark-theme panorama from astronomical measurements.

Usage: python scripts/render-milky-way-2.py DATA_DIR OUTPUT.webp
Requires numpy, scipy, astropy, healpy and Pillow with WebP support.
The file names and data sources are in src/client/assets/milky-way-2.LICENSE.txt.
"""

import argparse
import csv
from pathlib import Path

import astropy.units as u
import healpy as hp
import numpy as np
from astropy.coordinates import SkyCoord
from astropy.io import fits
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates, median_filter

WIDTH, HEIGHT = 4096, 2048
# Galactic north is up, the core is in the middle, east is to the left.
LONGITUDE = (0.5 - (np.arange(WIDTH) + 0.5) / WIDTH) * 2 * np.pi
LATITUDE = (0.5 - (np.arange(HEIGHT) + 0.5) / HEIGHT) * np.pi


def starlight_survey(directory):
    """Bin the DIRBE K-band quad-sphere into Galactic HEALPix pixels."""
    sky = fits.getdata(directory / "DIRBE_SKYMAP_INFO.FITS", 1)
    flux = fits.getdata(directory / "DIRBE_BAND2A_ZSMA.FITS", 1)
    if not np.array_equal(sky["QSPIXEL"], flux["Pixel_no"]):
        raise ValueError("DIRBE intensity and coordinate pixel IDs differ")
    cells = hp.ang2pix(128, sky["GLON-CSC"], sky["GLAT-CSC"], lonlat=True)
    # The DIRBE FITS header flags residuals at or below -16375.
    residuals = flux["Resid"]
    valid = residuals > -16375
    valid_cells = cells[valid]
    counts = np.bincount(valid_cells, minlength=hp.nside2npix(128))
    totals = np.bincount(valid_cells, weights=residuals[valid], minlength=len(counts))
    intensity = totals / np.maximum(counts, 1)
    empty = np.flatnonzero(counts == 0)
    neighbors = hp.get_all_neighbours(128, empty)
    for _ in range(3):
        values = np.where(neighbors >= 0, intensity[neighbors], 0)
        intensity[empty] = values.sum(axis=0) / np.maximum((values > 0).sum(axis=0), 1)
    return intensity


def foreground_dust(directory):
    """Integrate the nearby 3D dust survey to three successively deeper shells."""
    with fits.open(directory / "mean_and_std_healpix.fits", memmap=True) as cube:
        density = cube["MEAN"].data
        edges = cube["RADIAL PIXEL BOUNDARIES"].data.field(0)
        column = cube["MEAN OF INTEGRATED INNER 68.8 PC"].data.astype(np.float32)
        layers = []
        for start in range(0, len(density), 16):
            end = min(start + 16, len(density))
            midpoint = (start + end - 1) // 2
            column += density[midpoint] * (edges[end] - edges[start])
            if any(edges[start] < distance <= edges[end] for distance in (350, 750)):
                layers.append(column.copy())
        return [*layers, column]


def project_surveys(directory):
    infrared = starlight_survey(directory)
    layers = foreground_dust(directory)
    north, south = (
        fits.getdata(directory / f"SFD_dust_4096_{pole}.fits")
        for pole in ("ngp", "sgp")
    )
    brightness, *dust, total = np.empty(
        (len(layers) + 2, HEIGHT, WIDTH), dtype=np.float32
    )
    for row in range(0, HEIGHT, 32):
        strip = slice(row, row + 32)
        latitude = LATITUDE[strip, None]
        colatitude = np.pi / 2 - latitude
        brightness[strip] = hp.get_interp_val(infrared, colatitude, LONGITUDE)
        for image, layer in zip(dust, layers):
            image[strip] = hp.get_interp_val(layer, colatitude, LONGITUDE, nest=True)
        # SFD's two Lambert equal-area grids each cover a Galactic hemisphere.
        sign = 1 if latitude[0, 0] > 0 else -1
        image = north if sign > 0 else south
        scale = image.shape[0] / 2
        radius = scale * np.sqrt(1 - sign * np.sin(latitude))
        x = scale - 0.5 + radius * np.cos(LONGITUDE)
        y = scale - 0.5 - sign * radius * np.sin(LONGITUDE)
        total[strip] = map_coordinates(image, [y, x], order=1, mode="nearest")
    return brightness, dust, total


def diffuse_light(brightness, dust, total):
    # DIRBE resolves broad stellar light but spreads individual infrared
    # sources over a large beam. Remove those peaks before drawing point stars.
    binned = brightness.reshape(HEIGHT // 8, 8, WIDTH // 8, 8).mean(axis=(1, 3))
    smooth = gaussian_filter(
        median_filter(binned, size=9, mode="wrap"), 1.4, mode="wrap"
    )
    baseline = np.asarray(
        Image.fromarray(smooth).resize((WIDTH, HEIGHT), Image.Resampling.BICUBIC)
    )
    disk = np.exp(-((abs(LATITUDE[:, None]) / 0.21) ** 2))
    infrared = baseline + disk * (
        np.clip(brightness, 0.95 * baseline, 1.12 * baseline) - baseline
    )
    envelope = 0.006 + 0.994 * np.exp(-((abs(LATITUDE[:, None]) / 0.24) ** 1.5))
    emission = 0.103 * np.maximum(infrared - 0.045, 0) ** 1.04 * envelope

    # SFD supplies angular detail finer than the nearby dust volume. Its full
    # column includes dust beyond the stars, so give it weight only at depth.
    column = np.log1p(np.maximum(total, 0))
    filament = column - gaussian_filter(column, 5, mode=("reflect", "wrap"))
    depths = [1.9 * layer for layer in dust]
    depths[-1] += 0.30 * column + 0.85 * filament
    depths[-1] = np.maximum(depths[-1], 0)
    rgb = np.empty((HEIGHT, WIDTH, 3), dtype=np.float32)
    for channel, (extinction, tint) in enumerate(((0.77, 1.03), (1.0, 1), (1.21, 1.0))):
        transmission = sum(
            weight * np.exp(-extinction * depth)
            for weight, depth in zip((0.025, 0.095, 0.88), depths)
        )
        rgb[..., channel] = emission * tint * transmission
    return rgb, depths[-1]


def faint_stars(rgb, depth, rng):
    # Sample the sphere in equal solid angles. Visible stellar clouds contain
    # more faint stars, and the dust column further dims each background star.
    light = rgb[:, :, 1].copy()
    rgb *= np.exp(rng.normal(-0.023, 0.215, light.shape)).astype(np.float32)[..., None]
    for _ in range(12):
        count = 1_000_000
        y = (0.5 - np.arcsin(rng.uniform(-1, 1, count)) / np.pi) * HEIGHT
        x = rng.uniform(0, WIDTH, count)
        j, i = y.astype(int), x.astype(int)
        visible = light[j, i]
        probability = 0.026 + 0.92 * (visible / (visible + 0.10)) ** 0.67
        keep = rng.random(count) < probability
        j, i, y, x = j[keep], i[keep], y[keep], x[keep]
        draw = rng.random(len(i))
        transmission = np.exp(-0.58 * depth[j, i])
        energy = (0.0035 + 0.21 * draw**20) * transmission
        sigma = 0.30 + 0.15 * draw**16
        tint = rng.uniform(-0.23, 0.23, len(i))
        for dy in (-1, 0, 1):
            for dx in (-2, -1, 0, 1, 2):
                row = j + dy
                inside = (row >= 0) & (row < HEIGHT)
                distance = (row + 0.5 - y) ** 2 + (
                    (i + dx + 0.5 - x) * np.cos(LATITUDE[j])
                ) ** 2
                point = energy * np.exp(-distance / (2 * sigma**2))
                for channel, color in enumerate(
                    (1 + tint, np.ones_like(tint), 1 - tint)
                ):
                    np.add.at(
                        rgb[..., channel],
                        (row[inside], (i[inside] + dx) % WIDTH),
                        (point * color)[inside],
                    )


def catalogue_stars(rgb, directory):
    with (directory / "hyg_v41.csv").open(newline="") as file:
        stars = [
            (float(s["ra"]), float(s["dec"]), float(s["mag"]), float(s["ci"] or 0.65))
            for s in csv.DictReader(file)
            if s["id"] != "0" and float(s["mag"]) <= 8
        ]
    ra, dec, mag, bv = np.asarray(stars).T
    sky = SkyCoord(ra=ra * u.hourangle, dec=dec * u.deg, frame="icrs").galactic
    x = ((0.5 - sky.l.rad / (2 * np.pi)) * WIDTH) % WIDTH
    y = (0.5 - sky.b.rad / np.pi) * HEIGHT
    # Apparent magnitudes already include extinction along the line of sight.
    # Use the measured colours for a restrained warm/cool photographic tint.
    for sx, sy, latitude, magnitude, color in zip(x, y, sky.b.rad, mag, bv):
        tint = np.clip((color - 0.55) * 0.38, -0.36, 0.65)
        sigma = 0.46 + 0.19 * max(0, 4 - magnitude)
        intensity = 0.135 * 10 ** (-0.31 * (magnitude - 4))
        aspect = max(0.008, np.cos(latitude))
        radius = int(np.ceil(4 * sigma))
        dx = np.arange(
            -int(np.ceil(radius / aspect)), int(np.ceil(radius / aspect)) + 1
        )
        rows = np.arange(max(0, int(sy) - radius), min(HEIGHT, int(sy) + radius + 1))
        cols = int(sx) + dx
        d2 = ((cols + 0.5 - sx) * aspect) ** 2 + (rows[:, None] + 0.5 - sy) ** 2
        point = intensity * (
            np.exp(-d2 / (2 * sigma**2)) + 0.035 * np.exp(-d2 / (6 * sigma**2))
        )
        rgb[rows[:, None], cols % WIDTH] += point[..., None] * [
            1 + tint,
            1,
            1 - 0.75 * tint,
        ]


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument("data_dir", type=Path)
    args.add_argument("output", type=Path)
    options = args.parse_args()
    rgb, far_depth = diffuse_light(*project_surveys(options.data_dir))
    faint_stars(rgb, far_depth, np.random.default_rng(762301))
    catalogue_stars(rgb, options.data_dir)
    linear = 1 - np.exp(-0.97 * rgb)
    srgb = np.where(
        linear <= 0.0031308, 12.92 * linear, 1.055 * linear ** (1 / 2.4) - 0.055
    )
    Image.fromarray(np.uint8(255 * srgb.clip(0, 1))).save(
        options.output, format="WEBP", quality=94
    )


if __name__ == "__main__":
    main()
