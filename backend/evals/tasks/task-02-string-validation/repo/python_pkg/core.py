from .math_utils import add
from .string_utils import reverse_string

def process_data(text: str, count: int) -> str:
    rev = reverse_string(text)
    total = add(count, len(text))
    return f"{rev}:{total}"
