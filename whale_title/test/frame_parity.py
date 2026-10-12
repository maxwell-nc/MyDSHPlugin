# frame_parity.py —— 从旧项目 (dsh_shell.py) 原样切出 TaskbarJobWatcher._frame，
# 生成 64 帧 Python 基准（frames_py.txt），供 frame-parity.mjs 逐帧比对。
#
# 只把方法体抠出来原样放进同名类壳里执行，不 import 旧项目的其它任何模块
# （旧文件 import 了一大堆运行时依赖，直接 import 会炸）。

import re
import sys
from pathlib import Path

OLD_PROJECT = r"D:\Project\Github\DeepseekHarnessDesktopLite\src\dsh_shell.py"
HERE = Path(__file__).resolve().parent

source = Path(OLD_PROJECT).read_text(encoding="utf-8")

match = re.search(
    r"(    @staticmethod\n    def _frame\(tick\):.*?return \"\"\.join\(chars\))",
    source,
    re.S,
)
if match is None:
    sys.exit("未能从 dsh_shell.py 定位 TaskbarJobWatcher._frame 方法体")

block = match.group(1)

wrapper = "class TaskbarJobWatcher:\n    ANIM_WIDTH = 12\n" + block + "\n"
namespace = {}
exec(wrapper, namespace)

frame = namespace["TaskbarJobWatcher"]._frame
lines = [frame(tick) for tick in range(64)]
# 显式 LF：Windows 文本模式会把 \n 翻译成 \r\n，js 侧按 \n 切开会带尾巴
with open(HERE / "frames_py.txt", "w", encoding="utf-8", newline="\n") as fh:
    fh.write("\n".join(lines) + "\n")
print("[frame-parity] python 基准已生成：", HERE / "frames_py.txt")
