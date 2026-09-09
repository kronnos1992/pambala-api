import { EventEmitter } from "events";

type DisputeChangeListener = (orderId: string) => void;

/**
 * Hub de eventos em memória para o chat tripartido de disputas.
 *
 * Os streams SSE subscrevem-se para receber alterações apenas do pedido visível,
 * eliminando a necessidade de polling por parte do cliente. Cada mensagem,
 * mudança de estado ou ação de moderação publica um evento com o orderId afetado.
 */
class DisputeEventHub {
  private static instance?: DisputeEventHub;
  private readonly emitter = new EventEmitter();

  static getInstance(): DisputeEventHub {
    if (!DisputeEventHub.instance) {
      DisputeEventHub.instance = new DisputeEventHub();
    }
    return DisputeEventHub.instance;
  }

  publish(orderId: string): void {
    this.emitter.emit("change", orderId);
  }

  subscribe(listener: DisputeChangeListener): () => void {
    this.emitter.on("change", listener);
    return () => {
      this.emitter.off("change", listener);
    };
  }
}

export const disputeEvents = DisputeEventHub.getInstance();