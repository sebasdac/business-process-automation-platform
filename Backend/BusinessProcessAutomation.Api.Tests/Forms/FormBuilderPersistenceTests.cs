using Microsoft.EntityFrameworkCore;
using BusinessProcessAutomation.Api.Data;
using BusinessProcessAutomation.Api.DTOs.Forms;
using BusinessProcessAutomation.Api.Models;
using BusinessProcessAutomation.Api.Services;

namespace BusinessProcessAutomation.Api.Tests.Forms;

public class FormBuilderPersistenceTests
{
    [Fact]
    public async Task Fields_CanBeDuplicatedCustomizedReorderedAndLoadedAgain()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        await using var db = new AppDbContext(options);
        var form = new FormDefinition { Name = "Builder test", ApplicationId = 1 };
        db.FormDefinitions.Add(form);
        await db.SaveChangesAsync();

        var service = new FormService(db);
        var first = await service.AddFieldAsync(form.Id, new SaveFormFieldDto
        {
            FieldName = "textField",
            Label = "First text",
            FieldType = FieldType.Text,
            IsRequired = true,
            ValidationRules = new FieldValidationRulesDto { MinLength = 2, MaxLength = 80 }
        });
        var second = await service.AddFieldAsync(form.Id, new SaveFormFieldDto
        {
            FieldName = "textField2",
            Label = "Second text",
            FieldType = FieldType.Text,
            IsRequired = false
        });
        var firstFieldId = first.Fields.Single(field => field.FieldName == "textField").Id;
        var secondFieldId = second.Fields.Single(field => field.FieldName == "textField2").Id;

        await service.UpdateFieldAsync(firstFieldId, new SaveFormFieldDto
        {
            FieldName = "textField",
            Label = "Customized text",
            FieldType = FieldType.Text,
            IsRequired = true,
            DefaultValue = "Example",
            ValidationRules = new FieldValidationRulesDto { MinLength = 3, MaxLength = 40 }
        });
        await service.ReorderFieldsAsync(form.Id, new ReorderFieldsDto
        {
            FieldIdsInOrder = new List<int> { secondFieldId, firstFieldId }
        });

        var reloaded = await service.GetByIdAsync(form.Id);

        Assert.Equal(new[] { secondFieldId, firstFieldId }, reloaded.Fields.Select(field => field.Id));
        Assert.Equal(new[] { 1, 2 }, reloaded.Fields.Select(field => field.DisplayOrder));
        Assert.All(reloaded.Fields, field => Assert.Equal(FieldType.Text, field.FieldType));
        var customized = reloaded.Fields.Single(field => field.Id == firstFieldId);
        Assert.Equal("Customized text", customized.Label);
        Assert.Equal("Example", customized.DefaultValue);
        Assert.Equal(3, customized.ValidationRules?.MinLength);
        Assert.Equal(40, customized.ValidationRules?.MaxLength);

        var afterDelete = await service.DeleteFieldAsync(secondFieldId);
        Assert.Single(afterDelete.Fields);
        Assert.Equal(firstFieldId, afterDelete.Fields[0].Id);
    }
}
