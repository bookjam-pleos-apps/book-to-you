"""구연 작업용 MCP 서버. 에이전트가 tool calling으로 부른다. stdio로 돌며 읽기만 한다.

실행: uv run --directory gpu/spike --frozen python -m spike.guyeon_tools
"""
from pathlib import Path

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations

from spike.story.split_preview import SplitPreview, preview_split

server = MCPServer(
    "guyeon",
    instructions="동화 구연 태깅 중 대사를 복원한 원고가 어떻게 나뉘는지 확인할 때 쓴다. 판정하지 않는다.",
)


@server.tool(name="preview_split", annotations=ToolAnnotations(readOnlyHint=True))
def preview_split_file(path: str, min_syllables: int | None = None) -> SplitPreview:
    """대사를 복원한 원고(<id>.quoted.txt)를 분할기가 나누는 그대로 보여 준다.

    path는 절대 경로다. index는 run_tag_story가 만드는 초안의 문장 번호와 같다.
    pause_after_ms는 문장 뒤 쉼(450 문장, 900 문단)이다. 짝이 맞지 않는 따옴표는 error로 온다.
    min_syllables는 렌더할 실험 limits.json의 minSyllables다. 주면 문단에 혼자라 짧게 생성될 문장에 메모가 붙는다.
    짐작해서 넣지 않는다. 원고 낱말이 바뀌었는지는 보지 않는다. 그 검사는 check_quotes.py가 한다.
    """
    file = Path(path)
    if not file.is_absolute() or not file.is_file():
        raise ToolError(f"절대 경로의 파일이 아닙니다: {path}")
    return preview_split(file.read_text(encoding="utf-8"), min_syllables)


def main() -> None:
    server.run()


if __name__ == "__main__":
    main()
