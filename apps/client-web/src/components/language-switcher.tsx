import { supportedLanguages, toSupportedLanguage, type SupportedLanguage } from "@qhse/contracts";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@qhse/ui/components/dropdown-menu";
import { NativeSelect, NativeSelectOption } from "@qhse/ui/components/native-select";
import { useQueryClient } from "@tanstack/react-query";
import { LanguagesIcon } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { useOptionalAuth } from "../app/auth.js";
import { clientApi } from "../app/client-api.js";
import { i18n, languageNames, rememberLanguage } from "../app/i18n.js";

/**
 * Switches the interface language right away, caches it for the next first
 * paint and, when signed in, stores it on the account. AI-generated content is
 * unaffected: it follows each project's own language.
 */
export function useChangeInterfaceLanguage() {
  const user = useOptionalAuth()?.user ?? null;
  const queryClient = useQueryClient();
  return useCallback(
    async (language: SupportedLanguage) => {
      rememberLanguage(language);
      await i18n.changeLanguage(language);
      if (!user) return;
      queryClient.setQueryData(["auth", "preferences", user.id], { locale: language });
      try {
        await clientApi.updatePreferences({ locale: language });
      } catch {
        // The choice still applies to this browser; the account keeps its previous value.
      }
    },
    [queryClient, user],
  );
}

function useActiveLanguage(): SupportedLanguage {
  const { i18n: instance } = useTranslation();
  return toSupportedLanguage(instance.resolvedLanguage ?? instance.language);
}

/** Submenu for the user dropdown. */
export function LanguageMenu() {
  const { t } = useTranslation();
  const language = useActiveLanguage();
  const changeLanguage = useChangeInterfaceLanguage();
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <LanguagesIcon />
        {t("language.label")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          value={language}
          onValueChange={(value) => void changeLanguage(toSupportedLanguage(String(value)))}
        >
          {supportedLanguages.map((option) => (
            <DropdownMenuRadioItem key={option} value={option} lang={option}>
              {languageNames[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/** Compact selector for screens without the app shell (login, onboarding). */
export function LanguageSelect({ className }: { className?: string }) {
  const { t } = useTranslation();
  const language = useActiveLanguage();
  const changeLanguage = useChangeInterfaceLanguage();
  return (
    <div className={className}>
      <NativeSelect
        size="sm"
        aria-label={t("language.label")}
        value={language}
        onChange={(event) => void changeLanguage(toSupportedLanguage(event.target.value))}
      >
        {supportedLanguages.map((option) => (
          <NativeSelectOption key={option} value={option} lang={option}>
            {languageNames[option]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
