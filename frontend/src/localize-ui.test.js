const babel = require("@babel/core");
const localizeUi = require("../plugins/localize-ui");

describe("static UI localization transform", () => {
  const transform = (source) =>
    babel.transformSync(source, {
      babelrc: false,
      configFile: false,
      plugins: [localizeUi],
      generatorOpts: { jsescOption: { minimal: true } },
      parserOpts: { plugins: ["jsx"] },
    }).code;

  test("wraps visible static copy and translatable labels", () => {
    const output = transform(
      '<><div title="الصفوف">الصفوف</div><Field label="اسم الطالب" /></>',
    );

    expect(output).toContain('import { t as __t } from "@/i18n"');
    expect(output.match(/__t\("الصفوف"\)/g)).toHaveLength(2);
    expect(output).toContain('__t("اسم الطالب")');
  });

  test("does not wrap localized attributes or labels more than once", () => {
    const output = transform(
      '<><div title="الصفوف" /><Field label="اسم الطالب" /></>',
    );

    expect(output.match(/__t\("الصفوف"\)/g)).toHaveLength(1);
    expect(output.match(/__t\("اسم الطالب"\)/g)).toHaveLength(1);
    expect(output).not.toContain("__t(__t(");
  });

  test("leaves field values and record expressions unchanged", () => {
    const output = transform(
      '<input value="ذكر" name={student.fullName} placeholder="اسم الطالب" />',
    );

    expect(output).toContain('value="ذكر"');
    expect(output).toContain("name={student.fullName}");
    expect(output).toContain('__t("اسم الطالب")');
  });
});
