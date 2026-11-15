import asyncio
from pathlib import Path

import pytest
from mcp.server.mcpserver.exceptions import ToolError

from spike.guyeon_tools import server


def test_preview_split_is_listed_as_read_only():
    tools = {tool.name: tool for tool in asyncio.run(server.list_tools())}
    assert tools["preview_split"].annotations.read_only_hint is True


def test_preview_split_returns_structured_sentences(tmp_path: Path):
    quoted = tmp_path / "s.quoted.txt"
    quoted.write_text("“안녕!” 토끼가 말했어요.\n\n숲은 조용했어요.\n", encoding="utf-8")
    result = asyncio.run(server.call_tool("preview_split", {"path": str(quoted)}))
    assert not result.is_error
    assert [line["text"] for line in result.structured_content["sentences"]] == ["“안녕!” 토끼가 말했어요.", "숲은 조용했어요."]


def test_preview_split_refuses_relative_or_missing_paths(tmp_path: Path):
    with pytest.raises(ToolError):
        asyncio.run(server.call_tool("preview_split", {"path": "s.quoted.txt"}))
    with pytest.raises(ToolError):
        asyncio.run(server.call_tool("preview_split", {"path": str(tmp_path / "none.txt")}))
