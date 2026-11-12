import * as stack from "@maguirekrist/stack-config/oxlint";

// The plugin as a project reaches it: by the specifier the shared setup names.
export default {
  jsPlugins: stack.jsPlugins,
  rules: {
    "stack/no-disable-comments": stack.rules["stack/no-disable-comments"],
    "stack/no-infinite-loops": stack.rules["stack/no-infinite-loops"],
    "no-constant-condition": stack.rules["no-constant-condition"],
    "stack/prefer-option": stack.rules["stack/prefer-option"],
    "stack/prefer-tagged-union": stack.rules["stack/prefer-tagged-union"],
    "stack/no-tagged-literal": stack.rules["stack/no-tagged-literal"],
    "stack/type-from-schema": stack.rules["stack/type-from-schema"],
    "stack/mapper-with-its-type": stack.rules["stack/mapper-with-its-type"],
    "stack/no-companion-objects": stack.rules["stack/no-companion-objects"],
    ...stack.functionImports({
      workspace: ["@app"],
      utilities: ["@app/utilities"],
    }),
  },
};
