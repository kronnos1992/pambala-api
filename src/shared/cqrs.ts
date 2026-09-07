export interface ICommand {}

export interface IQuery {}

export interface ICommandHandler<TCommand extends ICommand, TResult = unknown> {
  handle(command: TCommand): Promise<TResult>;
}

export interface IQueryHandler<TQuery extends IQuery, TResult = unknown> {
  handle(query: TQuery): Promise<TResult>;
}