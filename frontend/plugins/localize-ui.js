const ARABIC = /[\u0600-\u06ff]/;
const TRANSLATABLE_ATTRIBUTES = new Set([
  "alt",
  "aria-label",
  "aria-description",
  "label",
  "placeholder",
  "title",
]);

function isTranslatableUiString(path, filename) {
  const parent = path.parentPath;
  if (parent.isJSXAttribute()) return false;
  if (
    filename.endsWith("Dashboard.jsx") ||
    filename.endsWith("Reports.jsx") ||
    filename.endsWith("StudentsList.jsx") ||
    filename.endsWith("Teachers.jsx") ||
    filename.endsWith("Attendance.jsx")
  ) {
    return true;
  }
  if (
    parent.isLogicalExpression() &&
    parent.node.right === path.node &&
    path.findParent((candidate) => candidate.isJSXExpressionContainer())
  ) {
    return true;
  }

  let jsxExpression = path.findParent((candidate) =>
    candidate.isJSXExpressionContainer(),
  );
  if (
    jsxExpression?.parentPath.isJSXAttribute() &&
    !TRANSLATABLE_ATTRIBUTES.has(
      jsxExpression.parentPath.node.name.name,
    )
  ) {
    jsxExpression = null;
  }
  if (jsxExpression) {
    const expressionParent = jsxExpression.parentPath;
    if (!expressionParent.isJSXAttribute()) return true;
    return TRANSLATABLE_ATTRIBUTES.has(expressionParent.node.name.name);
  }

  if (
    parent.isNewExpression() &&
    parent.node.callee.type === "Identifier" &&
    parent.node.callee.name === "Error"
  ) {
    return true;
  }

  if (parent.isObjectProperty()) {
    const key = parent.node.key.name || parent.node.key.value;
    if (["message", "loading", "success", "error", "description"].includes(key)) {
      return true;
    }
  }

  const call = path.findParent((candidate) => candidate.isCallExpression());
  if (!call) return false;
  const callee = call.node.callee;
  const name = callee.name || callee.property?.name || "";
  return (
    /^(alert|confirm|toast|setErr|setError|setMessage|setSuccess)/i.test(name) ||
    (callee.type === "MemberExpression" &&
      callee.object.type === "Identifier" &&
      callee.object.name === "toast")
  );
}

module.exports = function localizeUi({ types: t }) {
  return {
    name: "localize-static-arabic-ui",
    visitor: {
      ObjectProperty(path, state) {
        const key = path.node.key.name || path.node.key.value;
        const value = path.node.value;
        const inHeaders = key === "headers" && t.isArrayExpression(value);
        const inRoleLabels =
          /[\\/]Roles\.jsx$/.test(state.file.opts.filename || "") &&
          path.findParent(
            (candidate) =>
              candidate.isVariableDeclarator() &&
              candidate.node.id.type === "Identifier" &&
              candidate.node.id.name === "RES_LABELS",
          );
        if (inHeaders) {
          value.elements.forEach((element, index) => {
            if (t.isStringLiteral(element) && ARABIC.test(element.value)) {
              value.elements[index] = t.callExpression(t.identifier("__t"), [
                t.stringLiteral(element.value),
              ]);
              state.file.metadata.localizesUi = true;
            }
          });
        }
        if (
          (key !== "label" && !inRoleLabels) ||
          !t.isStringLiteral(value) ||
          !ARABIC.test(value.value)
        ) {
          return;
        }

        path.node.value = t.callExpression(t.identifier("__t"), [
          t.stringLiteral(value.value),
        ]);
        state.file.metadata.localizesUi = true;
      },

      TemplateLiteral(path, state) {
        if (!path.node.quasis.some((part) => ARABIC.test(part.value.cooked || ""))) {
          return;
        }
        const filename = state.file.opts.filename || "";
        const isDashboard =
          filename.endsWith("Dashboard.jsx") ||
          filename.endsWith("Reports.jsx") ||
          filename.endsWith("StudentsList.jsx") ||
          filename.endsWith("Teachers.jsx") ||
          filename.endsWith("Attendance.jsx");
        const call = path.findParent((candidate) => candidate.isCallExpression());
        const jsxExpression = path.findParent((candidate) =>
          candidate.isJSXExpressionContainer(),
        );
        if (!call && !jsxExpression && !isDashboard) return;
        if (
          call &&
          !/^(alert|confirm|toast|setErr|setError|setMessage|setSuccess)/i.test(
            call.node.callee.name || call.node.callee.property?.name || "",
          ) &&
          !jsxExpression &&
          !isDashboard
        ) {
          return;
        }

        const options = [];
        const phrase = path.node.quasis
          .map((part, index) => {
            const value = part.value.cooked || "";
            if (index >= path.node.expressions.length) return value;
            options.push(
              t.objectProperty(
                t.numericLiteral(index),
                path.node.expressions[index],
              ),
            );
            return `${value}{{${index}}}`;
          })
          .join("");
        path.replaceWith(
          t.callExpression(t.identifier("__t"), [
            t.stringLiteral(phrase),
            t.objectExpression(options),
          ]),
        );
        path.skip();
        state.file.metadata.localizesUi = true;
      },

      JSXText(path, state) {
        const value = path.node.value;
        const phrase = value.trim();
        if (!phrase || !ARABIC.test(phrase)) return;

        const leading = value.match(/^\s*/)?.[0] || "";
        const trailing = value.match(/\s*$/)?.[0] || "";
        const parts = [];
        if (leading) parts.push(t.jsxText(leading));
        parts.push(
          t.jsxExpressionContainer(
            t.callExpression(t.identifier("__t"), [t.stringLiteral(phrase)]),
          ),
        );
        if (trailing) parts.push(t.jsxText(trailing));
        path.replaceWithMultiple(parts);
        state.file.metadata.localizesUi = true;
      },

      JSXAttribute(path, state) {
        const value = path.node.value;
        const elementName =
          path.parentPath.parentPath.node.name?.name || "";
        const isChartName =
          path.node.name.name === "name" && elementName === "Bar";
        if (
          (!TRANSLATABLE_ATTRIBUTES.has(path.node.name.name) && !isChartName) ||
          !value ||
          !t.isStringLiteral(value) ||
          !ARABIC.test(value.value)
        ) {
          return;
        }

        path.node.value = t.jsxExpressionContainer(
          t.callExpression(t.identifier("__t"), [t.stringLiteral(value.value)]),
        );
        state.file.metadata.localizesUi = true;
      },

      JSXExpressionContainer(path, state) {
        const expression = path.node.expression;
        if (
          !t.isMemberExpression(expression) ||
          !t.isIdentifier(expression.object) ||
          !/_LABELS$/.test(expression.object.name)
        ) {
          return;
        }

        path.node.expression = t.callExpression(t.identifier("__t"), [expression]);
        state.file.metadata.localizesUi = true;
      },

      StringLiteral(path, state) {
        if (
          (path.parentPath.isCallExpression() &&
            path.parentPath.node.callee.type === "Identifier" &&
            path.parentPath.node.callee.name === "__t") ||
          !ARABIC.test(path.node.value) ||
          !isTranslatableUiString(path, state.file.opts.filename || "")
        ) {
          return;
        }
        path.replaceWith(
          t.callExpression(t.identifier("__t"), [t.stringLiteral(path.node.value)]),
        );
        path.skip();
        state.file.metadata.localizesUi = true;
      },

      Program: {
        exit(path, state) {
          if (!state.file.metadata.localizesUi) return;
          path.unshiftContainer(
            "body",
            t.importDeclaration(
              [t.importSpecifier(t.identifier("__t"), t.identifier("t"))],
              t.stringLiteral("@/i18n"),
            ),
          );
        },
      },
    },
  };
};
