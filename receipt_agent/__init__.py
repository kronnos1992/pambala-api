"""Agente de verificação de comprovativos de pagamento do Pambala.

Responsável por validar a autenticidade dos comprovativos submetidos:
forense de imagem (ELA/detecção de edição), OCR (Tesseract), verificação
de valor/referência/entidade e avaliação semântica por visão LLM.

Mesma arquitetura do `translation_agent`: Python, lê o SQLite do Prisma
diretamente e grava o resultado da validação nas colunas de `Order`.
"""