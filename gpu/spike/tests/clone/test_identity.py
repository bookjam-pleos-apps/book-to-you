import numpy as np
import pytest

from spike.clone.identity import centroid_similarities, cosine


def test_centroid_similarities_compare_each_embedding_with_the_mean():
    embeddings = [np.array([1.0, 0.0]), np.array([0.0, 1.0]), np.array([1.0, 1.0])]
    centroid = np.array([2 / 3, 2 / 3])
    assert centroid_similarities(embeddings) == pytest.approx([cosine(e, centroid) for e in embeddings])
