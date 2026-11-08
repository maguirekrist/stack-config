import * as stack from "@maguirekrist/stack-config/oxlint";

// The plugin as a project reaches it: by the specifier the shared setup names.
export default {
  jsPlugins: stack.jsPlugins,
  rules: {
    "stack/no-disable-comments": stack.rules["stack/no-disable-comments"],
    "stack/no-infinite-loops": stack.rules["stack/no-infinite-loops"],
    "no-constant-condition": stack.rules["no-constant-condition"],
  },
};
