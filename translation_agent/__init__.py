"""Agente de tradução do Pambala.

Agente Python (sem dependências externas) que "aprende" os idiomas suportados a
partir do corpus já traduzido (messages/*.json) e é responsável por todas as
traduções do sistema:
  - conteúdo da base (Product/Category/Store) nas tabelas *Translation;
  - sincronização das mensagens de UI (messages/*.json).

Uso:  python -m translation_agent.agent [comando] [opções]
"""
from translation_agent import config

__version__ = "0.1.0"
__all__ = ["config", "__version__"]