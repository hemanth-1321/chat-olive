import re
  
PATTERNS = [
      (re.compile(r'\b[\w.-]+@[\w.-]+\.\w{2,}\b'), '[EMAIL]'),
      (re.compile(r'\b(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b'), '[PHONE]'),
      (re.compile(r'\b\d{3}-\d{2}-\d{4}\b'), '[SSN]'),
      (re.compile(r'\b(?:4\d{12}(?:\d{3})?|5[1-5]\d{14}|3[47]\d{13})\b'), '[CARD]'),
  ]
  
  
def redact(text: str) -> str:
      for pattern, replacement in PATTERNS:
          text = pattern.sub(replacement, text)
      return text
  
  