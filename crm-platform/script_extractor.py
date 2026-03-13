import PyPDF2
reader = PyPDF2.PdfReader(r'C:\Users\Lap3p\Downloads\Contract_236701_2.pdf')
for i, page in enumerate(reader.pages):
    text = page.extract_text()
    print(f"--- PAGE {i+1} ---")
    if text:
        print(text)
