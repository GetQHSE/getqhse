import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { XIcon } from "lucide-react";
import { MAX_PROJECT_COUNTRIES, countryName, countryOptions } from "@qhse/domain/countries";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@qhse/ui/components/combobox";

import { currentLanguage } from "../app/i18n.js";

type CountryOption = { code: string; name: string };

/**
 * Searchable multi-select of ISO country codes, capped at
 * MAX_PROJECT_COUNTRIES. The value is the list of codes, in selection order.
 */
export function CountryMultiSelect({
  value,
  onChange,
  label,
  max = MAX_PROJECT_COUNTRIES,
}: {
  value: string[];
  onChange: (codes: string[]) => void;
  label?: string;
  max?: number;
}) {
  const { t, i18n } = useTranslation();
  const language = currentLanguage();
  // Country names and their sort order follow the interface language.
  const options = useMemo(() => countryOptions(language), [language, i18n.language]);
  const anchor = useComboboxAnchor();
  const [query, setQuery] = useState("");
  const full = value.length >= max;
  const items = useMemo(
    () => (full ? [] : options.filter((option) => !value.includes(option.code))),
    [full, options, value],
  );

  return (
    <div>
      <Combobox
        multiple
        items={items}
        itemToStringLabel={(item: CountryOption) => item.name}
        value={value.map((code) => ({ code, name: countryName(code, language) }))}
        onValueChange={(next: CountryOption[]) => {
          onChange(next.map((item) => item.code).slice(0, max));
          setQuery("");
        }}
        isItemEqualToValue={(item: CountryOption, selected: CountryOption) =>
          item.code === selected.code
        }
        inputValue={query}
        onInputValueChange={setQuery}
      >
        <ComboboxChips
          ref={anchor}
          className="min-h-11 rounded-xl border-slate-200 bg-slate-50/70 px-2.5 focus-within:border-violet-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-violet-100"
        >
          {value.map((code) => (
            <ComboboxChip
              key={code}
              showRemove={false}
              className="rounded-full bg-slate-900 py-1 ps-3 pe-1.5 text-white"
            >
              {countryName(code, language)} <span className="text-slate-400">{code}</span>
              <button
                type="button"
                aria-label={t("countries.remove", { country: countryName(code, language) })}
                className="ms-1 grid size-4.5 place-items-center rounded-full text-slate-300 hover:bg-white/10 hover:text-white"
                onClick={() => onChange(value.filter((item) => item !== code))}
              >
                <XIcon className="size-3" />
              </button>
            </ComboboxChip>
          ))}
          <ComboboxChipsInput
            aria-label={label ?? t("countries.label")}
            disabled={full}
            placeholder={
              full
                ? t("countries.max", { count: max })
                : value.length
                  ? t("countries.add")
                  : t("countries.search")
            }
          />
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxList>
            <ComboboxCollection>
              {(item: CountryOption) => (
                <ComboboxItem key={item.code} value={item}>
                  {item.name} <span className="ms-auto text-xs text-slate-400">{item.code}</span>
                </ComboboxItem>
              )}
            </ComboboxCollection>
            <ComboboxEmpty>{t("countries.empty")}</ComboboxEmpty>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <p className="mt-1.5 text-xs text-slate-500">
        {t("countries.selected", { count: value.length, max })}
      </p>
    </div>
  );
}
