// FileSchemaProvider (FileProvider (SDL || IntrospectionResult) => schema)
import {
  GraphQLSchema,
  buildClientSchema,
  Source,
  buildSchema,
  printSchema,
  parse
} from "graphql";
import { readFileSync } from "fs";
import { extname, resolve } from "path";
import { GraphQLSchemaProvider, SchemaChangeUnsubscribeHandler } from "./base";
import { NotificationHandler } from "vscode-languageserver";
import { Debug } from "../../utilities";
import { buildSchemaFromSDL } from "apollo-graphql";

export interface FileSchemaProviderConfig {
  path?: string;
  paths?: string[];
}
// XXX file subscription
export class FileSchemaProvider implements GraphQLSchemaProvider {
  private schema?: GraphQLSchema;
  private federatedServiceSDL?: string;

  constructor(private config: FileSchemaProviderConfig) {}

  async resolveSchema() {
    if (this.schema) return this.schema;
    const { path, paths } = this.config;

    // load each path and get sdl string from each, if a list, concatenate them all
    const documents = path
      ? [this.loadFileAndGetDocument(path)]
      : paths
      ? paths.map(this.loadFileAndGetDocument)
      : undefined;

    if (!documents)
      throw new Error(
        `Schema could not be loaded for [${
          path ? path : paths ? paths.join(", ") : "undefined"
        }]`
      );

    this.schema = buildSchemaFromSDL(documents);

    if (!this.schema) throw new Error(`Schema could not be loaded for ${path}`);
    return this.schema;
  }

  // load a graphql file or introspection result and return the GraphQL DocumentNode
  // this is the mechanism for loading a single file's DocumentNode
  loadFileAndGetDocument(path: string) {
    let result;
    try {
      result = readFileSync(path, {
        encoding: "utf-8"
      });
    } catch (err) {
      throw new Error(`Unable to read file ${path}. ${err.message}`);
    }

    const ext = extname(path);

    // an actual introspectionQuery result, convert to DocumentNode
    if (ext === ".json") {
      const parsed = JSON.parse(result);
      const __schema = parsed.data
        ? parsed.data.__schema
        : parsed.__schema
        ? parsed.__schema
        : parsed;

      const schema = buildClientSchema({ __schema });
      return parse(printSchema(schema));
    } else if (ext === ".graphql" || ext === ".graphqls" || ext === ".gql") {
      return parse(result);
    }
    throw new Error(
      "File Type not supported for schema loading. Must be a .json, .graphql, .gql, or .graphqls file"
    );
  }

  onSchemaChange(
    _handler: NotificationHandler<GraphQLSchema>
  ): SchemaChangeUnsubscribeHandler {
    throw new Error("File watching not implemented yet");
    return () => {};
  }

  // Load SDL from a single file. This is only used with federated services,
  // since they need full SDL and not the printout of GraphQLSchema
  async resolveFederatedServiceSDL() {
    if (this.federatedServiceSDL) return this.federatedServiceSDL;

    const { path, paths } = this.config;

    // load each path and get sdl string from each, if a list, concatenate them all
    const SDLs = path
      ? [this.loadFileAndGetSDL(path)]
      : paths
      ? paths.map(this.loadFileAndGetSDL)
      : undefined;

    if (!SDLs)
      throw new Error(
        `SDL could not be loaded for one of more files: [${
          path ? path : paths ? paths.join(", ") : "undefined"
        }]`
      );

    this.federatedServiceSDL = SDLs.join("\n");
    return this.federatedServiceSDL;
  }

  // this is the mechanism for loading a single file's SDL
  loadFileAndGetSDL(path: string) {
    let result;
    try {
      result = readFileSync(path, {
        encoding: "utf-8"
      });
    } catch (err) {
      return Debug.error(`Unable to read file ${path}. ${err.message}`);
    }

    const ext = extname(path);

    // this file should already be in sdl format
    if (ext === ".graphql" || ext === ".graphqls" || ext === ".gql") {
      return result as string;
    } else {
      return Debug.error(
        "When using localSchemaFile to check or push a federated service, you can only use .graphql, .gql, and .graphqls files"
      );
    }
  }
}
