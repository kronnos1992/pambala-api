import { ICommand, ICommandHandler, IQuery, IQueryHandler } from "./cqrs";

type CommandCtor<T extends ICommand> = new (...args: any[]) => T;
type QueryCtor<T extends IQuery> = new (...args: any[]) => T;

export class Mediator {
  private readonly commandHandlers = new Map<Function, ICommandHandler<any, any>>();
  private readonly queryHandlers = new Map<Function, IQueryHandler<any, any>>();

  register<T extends ICommand, TResult = unknown>(
    command: CommandCtor<T>,
    handler: ICommandHandler<T, TResult>
  ): void {
    this.commandHandlers.set(command, handler);
  }

  registerQuery<T extends IQuery, TResult = unknown>(
    query: QueryCtor<T>,
    handler: IQueryHandler<T, TResult>
  ): void {
    this.queryHandlers.set(query, handler);
  }

  send<TResult = unknown>(command: ICommand): Promise<TResult> {
    const handler = this.commandHandlers.get(
      command.constructor as CommandCtor<ICommand>
    );
    if (!handler) {
      throw new Error(`No command handler registered for ${command.constructor.name}`);
    }
    return handler.handle(command);
  }

  query<TResult = unknown>(query: IQuery): Promise<TResult> {
    const handler = this.queryHandlers.get(
      query.constructor as QueryCtor<IQuery>
    );
    if (!handler) {
      throw new Error(`No query handler registered for ${query.constructor.name}`);
    }
    return handler.handle(query);
  }
}

export const mediator = new Mediator();