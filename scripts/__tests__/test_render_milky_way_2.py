import unittest
from pathlib import Path
from runpy import run_path
from tempfile import TemporaryDirectory

import healpy as hp
import numpy as np
from astropy.io import fits

starlight_survey = run_path(
    str(Path(__file__).resolve().parents[1] / "render-milky-way-2.py")
)["starlight_survey"]


class StarlightSurveyTest(unittest.TestCase):
    def test_flagged_samples_are_excluded_from_the_cell_mean(self):
        ids = np.arange(5)
        longitude = [0, 0, 0, 0, 90]
        with TemporaryDirectory() as directory:
            data = Path(directory)
            fits.BinTableHDU.from_columns(
                [
                    fits.Column(name="QSPIXEL", format="J", array=ids),
                    fits.Column(name="GLON-CSC", format="E", array=longitude),
                    fits.Column(name="GLAT-CSC", format="E", array=np.zeros(len(ids))),
                ]
            ).writeto(data / "DIRBE_SKYMAP_INFO.FITS")
            fits.BinTableHDU.from_columns(
                [
                    fits.Column(name="Pixel_no", format="J", array=ids),
                    fits.Column(
                        name="Resid", format="E", array=[3, -16375, 7, -16376, -16375]
                    ),
                ]
            ).writeto(data / "DIRBE_BAND2A_ZSMA.FITS")

            intensity = starlight_survey(data)

        valid_cell = hp.ang2pix(128, 0, 0, lonlat=True)
        flagged_cell = hp.ang2pix(128, 90, 0, lonlat=True)
        self.assertEqual(intensity[valid_cell], 5)
        self.assertEqual(intensity[flagged_cell], 0)
