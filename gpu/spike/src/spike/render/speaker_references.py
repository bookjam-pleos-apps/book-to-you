"""화자의 감정별 참조 음성과 대본을 묶는다."""
from collections.abc import Iterable

from spike.clone.catalog import load_reference_scripts, load_speakers, reference_text, select_speakers
from spike.clone.layout import Condition
from spike.clone.reference.ref_prep import PrepareReference, prepare_reference, prepared_speaker_reference
from spike.render.story_render import Reference


def speaker_references(
    speaker: str,
    condition: Condition,
    styles: Iterable[str],
    prepare: PrepareReference = prepare_reference,
) -> dict[str, Reference]:
    scripts = load_reference_scripts()
    speaker_scripts = select_speakers(load_speakers(), [speaker])[0].scripts
    return {
        style: Reference(prepared_speaker_reference(speaker, condition, style, prepare), reference_text(style, scripts, speaker_scripts))
        for style in styles
    }
